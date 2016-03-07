/*
 * tads3.js
 * A port of TADS3 to JavaScript.
 * Copyright(C) Mikhail Voloshin.
 */

/// Parses the binary data as TADS3 bytecode, and runs it in a TADS3 VM.
/// Grabs the element specified by divselector (as a jQuery selector)
/// and uses it as a console.
var tads3 = function(t3binarydata, divselector) {};

(function() { // Master IIFE
  var CONSTANTS = {
    // A string that must be found in the file header.
    // Marks the beginning of readable data.
    VMIMAGE_SIG: "T3-image\015\012\032",

    // A flag found at the beginning of each data block.
    // If set to true, the block is mandatory to read, and
    // if the parser cannot process it then it must abort.
    VMIMAGE_DBF_MANDATORY: 0x0001,
    
    // The number of bytes in a pool subarray.
    VMIMAGE_POOL_SUBARRAY_SIZE: 4096,
  };

  var VM_DATA = {
    // An integer representing the offset in the VM code that
    // represents the program's entry point.
    entry_point: null,
    
    // A collection of 
    IMAGE_POOLS: {},
  };

  function PoolBackingStore(pageCount, pageSize) {
    var self = this;
    self.pageCount = pageCount;
    self.pageSize = pageSize;
    
    self.pageInfo = [];
    self.pageInfo.length = pageCount;
  };


  var parse;

  (function() { // Parser IIFE
    var _curpos = 0;
    var _data = null;

    var readBytes = function(n) {
      if (!_data) { 
        return null; 
      }
      if (n <= 0) {
        return "";
      }
      
      var retval = _data.slice(_curpos, _curpos + n);
      
      if (retval.length != n) {
        throw new TypeError('TADS3 parse error: hit unexpected EOF', null, _curpos);        
      }
      
      _curpos += retval.length;
      return retval;
    };
    
    var readNullPadding = function(n, canHaveNoise) {
      var padding = readBytes(n);
      if (!canHaveNoise) {
        _.each(padding, function(c) {
          if (c !== '\0') {
            throw new TypeError('TADS3 parse error: data found in null padding', 
                null, _curpos);
          }
        });
      }
      return padding;
    };
    
    var toLittleEndianNumber = function(s) {
      var retval = 0;
      for (i = 0; i < s.length; i++) {
        retval += s.charCodeAt(i) << (i * 8);
      }
      return retval;
    };
    
    var readUint8 = function() {
      return toLittleEndianNumber(readBytes(1));
    };
    
    var readUint16 = function() {
      return toLittleEndianNumber(readBytes(2));
    };

    var readUint32 = function() {
      return toLittleEndianNumber(readBytes(4));
    };


    var readFileHeader = function() {
      var fileSig = readBytes(CONSTANTS.VMIMAGE_SIG.length);
      if (fileSig !== CONSTANTS.VMIMAGE_SIG) {
        throw new TypeError('TADS3 parse error: file signature invalid.', null, _curpos);
      }
      
      var fileVersionNum = readUint16();

      if (fileVersionNum !== 1) {
        throw new TypeError('TADS3 parse error: does not support version ' + 
            fileVersionNum, null, _curpos);
      }

      readNullPadding(32, true);

      var fileTimestamp = readBytes(24);
      console.log(fileTimestamp);
    };

    var readDataBlock = function() {
      var blockTypeCode = readBytes(4).trim();
      var blockSize = readUint32();
      var flags = readUint16();
      
      var moreDataToRead = true;
      
      switch (blockTypeCode) {
        case "EOF":
          moreDataToRead = false;
          break;

        case "ENTP":
          readEntryPointDataBlock(blockSize);
          break;
          
        case "CPDF":
          readConstantPoolDefinitionDataBlock(blockSize);
          break;

        case "CPPG":
          readConstantPoolPageDataBlock(blockSize);
          break;
          
        case "OBJS":
          //readStaticObjectDataBlock(blockSize);

        case "MRES":
        case "MREL":
        case "MCLD":
        case "FNSD":
        case "SYMD":
        case "SRCF":
        case "GSYM":
        case "MACR":
        case "MHLS":
        case "SINI":
        default: {
          var isMandatory = flags & CONSTANTS.VMIMAGE_DBF_MANDATORY;
          isMandatory = false; // TODO: REMOVE THIS!!! DEVELOPMENT PURPOSES ONLY!!
          if (isMandatory) {
            throw new TypeError('TADS3 parse error: unknown data block type: ' + 
                blockTypeCode, null, _curpos);
          } else {
            console.log('TADS3 parse warning: unknown data block type: ' + blockTypeCode);
            readNullPadding(blockSize, true);
          }
        }
      }

      return moreDataToRead;
    };

    // Load an entry point block ("ENTP")
    var readEntryPointDataBlock = function(blockSize) {
      if (!!VM_DATA.entry_point) {
        throw new TypeError('TADS3 parse error: Entry point already set', 
            null, _curpos);
      }

      VM_DATA.entry_point = readUint32();
      VM_DATA.function_header_size = readUint16();
      VM_DATA.exception_table_entry_size = readUint16();
      VM_DATA.debugger_source_line_record_size = readUint16();
      VM_DATA.debug_table_header_size = readUint16();
      VM_DATA.debug_local_symbol_header_size = readUint16();
      VM_DATA.debug_format_version_id = readUint16();

      VM_DATA.debug_frame_size = 4;
      blockSize -= 16;
      if (blockSize >= 2) {
        VM_DATA.debug_frame_size = readUint16();
        blockSize -= 2;
      }
      
      readNullPadding(blockSize, true);
    };

    // Load a Constant Pool Definition block ("CPDF") 
    var readConstantPoolDefinitionDataBlock = function(blockSize) {
      var poolId = readUint16() - 1;
      var pageCount = readUint32();
      var pageSize = readUint32();

      var pool = new PoolBackingStore(pageCount, pageSize);
      VM_DATA.IMAGE_POOLS[poolId] = pool;

      var bytesRemaining = blockSize - 10;
      readNullPadding(blockSize - 10, true);
    };
    
    // Load a Constant Pool Page block ("CPPG") 
    var readConstantPoolPageDataBlock = function(blockSize) {
      var poolId = readUint16() - 1;
      var pageIndex = readUint32();
      var xorMask = readUint8();
      
      var rawPageData = readBytes(blockSize - 7);
      
      VM_DATA.IMAGE_POOLS[poolId][pageIndex] = {
        xorMask: xorMask,
        pageSize: VM_DATA.IMAGE_POOLS[poolId].pageSize,
        rawPageData: rawPageData
      };
    };

    
    
    parse = function(data) {
      _data = data;
      _curpos = 0;
      
      readFileHeader();
      while (readDataBlock());
    };
    
  }()); // Close parser IIFE

  tads3 = function(t3binarydata, divselector) {
    parse(t3binarydata);
    
    window.VM_DATA = VM_DATA;
  };

}()); // Close the master IIFE

