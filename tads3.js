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
    
    // The size of a buffer to allocate for a portable data holder.
    VMB_DATAHOLDER: 5,
    
    // The size of a static initializer. Used in the SINI block.
    VM_STATIC_INIT_PAGE_MAX: 1000,
  };

  var DATA_TYPE_CODES = {
    VM_NIL: 1,
    VM_TRUE: 2,
    VM_STACK: 3,
    VM_CODEPTR: 4,
    VM_OBJ: 5, 
    VM_PROP: 6, 
    VM_INT: 7,
    VM_SSTRING: 8,
    VM_DSTRING: 9,
    VM_LIST: 10,
    VM_CODEOFS: 11, 
    VM_FUNCPTR: 12,
    VM_EMPTY: 13,
    VM_NATIVE_CODE: 14,
    VM_ENUM: 15, 
    VM_BIFPTR: 16,
    VM_OBJX: 17,
    VM_BIFPTRX: 18,
    VM_FIRST_INVALID_TYPE: 19
  };
  function VariableDataType() {
    var self = this;
    self.enumval = null;
    self.obj = null;
    self.prop = null;
    self.intval = null;
    self.ofs = null;
    self.bifptr  = {
      set_idx: null,
      func_idx: null
    };
  };
  
  

  var VM_DATA = {
    // An integer representing the offset in the VM code that
    // represents the program's entry point.
    entry_point: null,
    
    // Static data code offset. Set in the SINI block.
    staticCodeOffset: null,
    
    // Static data initialization pages. Set in the SINI block.
    staticPageData: [],
    
    // A collection of memory image pools.
    IMAGE_POOLS: [null, null],
    
    // All current active objects, keyed by numerical object ID.
    OBJECTS: {},
    
    // The metaclass table, which is how new objects get generated.
    METACLASSES: {},

    // The function set dependency table, which is where global
    // functions come from.
    FUNCTIONS: {},
    
    
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
        throw new TypeError('TADS3 bytecode parse error: hit unexpected EOF', null, _curpos);        
      }
      
      _curpos += retval.length;
      return retval;
    };
    
    var readNullPadding = function(n, canHaveNoise) {
      var padding = readBytes(n);
      if (!canHaveNoise) {
        _.each(padding, function(c) {
          if (c !== '\0') {
            throw new TypeError('TADS3 bytecode parse error: data found in null padding', 
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
    
    var readVariableType = function() {
      var retval = new VariableDataType();
      var typecode = readUint8();
      switch (typecode) {
        case DATA_TYPE_CODES.VM_OBJ:
        case DATA_TYPE_CODES.VM_OBJX:
          retval.obj = readUint32();
          break;
          
        case DATA_TYPE_CODES.VM_PROP:
          retval.prop = readUint16();
          break;
          
        case DATA_TYPE_CODES.VM_INT:
          retval.intval = readUint32();
          break;
          
        case DATA_TYPE_CODES.VM_BIFPTR:
        case DATA_TYPE_CODES.VM_BIFPTRX:
          retval.bifptr.func_idx = readUint16();
          retval.bifptr.set_idx = readUint16();
          break;

        case DATA_TYPE_CODES.VM_ENUM:
          retval.intval = readUint32();
          break;
        
        default:
          retval.ofs = readUint32();
      };
      return retval;
    };


    var readFileHeader = function() {
      var fileSig = readBytes(CONSTANTS.VMIMAGE_SIG.length);
      if (fileSig !== CONSTANTS.VMIMAGE_SIG) {
        throw new TypeError('TADS3 bytecode parse error: file signature invalid.', null, _curpos);
      }
      
      var fileVersionNum = readUint16();

      if (fileVersionNum !== 1) {
        throw new TypeError('TADS3 bytecode parse error: does not support version ' + 
            fileVersionNum, null, _curpos);
      }

      readNullPadding(32, true);

      var fileTimestamp = readBytes(24);
    };

    var readDataBlock = function() {
      var blockTypeCode = readBytes(4).trim();
      var blockSize = readUint32();
      var flags = readUint16();
      
      var moreDataToRead = true;

      console.log(blockTypeCode);
      
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
          readStaticObjectDataBlock(blockSize);
          break;

        case "MRES":
          readMultimediaResourceBlock(blockSize);
          break;

        case "MREL":
          readMultimediaResourceLinkBlock(blockSize);
          break;
          
        case "MCLD":
          readMetaclassDependencyBlock(blockSize);
          break;
        
        case "SYMD":
          readSymbolicNamesExportBlock(blockSize);
          break;

        case "FNSD":
          readFunctionalSetDependencyBlock(blockSize);
          break;
          
        case "SINI":
          readStaticInitializerBlock(blockSize);
          break;

        case "SRCF":
        case "GSYM":
        case "MACR":
        case "MHLS":
        default: {
          var isMandatory = flags & CONSTANTS.VMIMAGE_DBF_MANDATORY;
          if (isMandatory) {
            throw new TypeError('TADS3 bytecode parse error: unknown data block type: ' + 
                blockTypeCode, null, _curpos);
          } else {
            console.log('TADS3 bytecode parse warning: unknown data block type: ' + blockTypeCode);
            readNullPadding(blockSize, true);
          }
        }
      }

      return moreDataToRead;
    };

    // Load an entry point block ("ENTP")
    var readEntryPointDataBlock = function(blockSize) {
      if (!!VM_DATA.entry_point) {
        throw new TypeError('TADS3 bytecode parse error: Entry point already set', 
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
      
      //readNullPadding(blockSize, true);
    };

    // Load a Constant Pool Definition block ("CPDF") 
    var readConstantPoolDefinitionDataBlock = function(blockSize) {
      var poolId = readUint16() - 1;
      var pageCount = readUint32();
      var pageSize = readUint32();

      var pool = new PoolBackingStore(pageCount, pageSize);
      VM_DATA.IMAGE_POOLS[poolId] = pool;

      var bytesRemaining = blockSize - 10;
      //readNullPadding(blockSize - 10, true);
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

    // Load a Static Object block ("OBJS") 
    var readStaticObjectDataBlock = function(blockSize) {
      var numObjects = readUint16();
      var objectMetaclassIndex = readUint16();
      var objectFlags = readUint16();
      blockSize -= 6;
      
      var isLargeObjects = !!(objectFlags & 1);
      var isTransientObjects = !!(objectFlags & 2);

      for (var iObj = 0; iObj < numObjects; iObj++) {
        var objectId = readUint32();
        blockSize -= 4;
        var objectSize = isLargeObjects ? readUint32() : readUint16();
        blockSize -= isLargeObjects ? 4 : 2;
        
        var objectData = readBytes(objectSize);
        blockSize -= objectSize;
        
        var theObject = {
          id: objectId,
          metaclass: objectMetaclassIndex,
          objectData: objectData
        };
        // TODO: LOAD THE OBJECT BASED ON ITS METACLASS ID.
        VM_DATA.OBJECTS[objectId] = theObject;
        // TODO: MARK OBJECT TRANSIENT
      }
      //readNullPadding(blockSize, true);
    };

    // Load a Multimedia Resource block ("MRES") 
    var readMultimediaResourceBlock = function(blockSize) {
      console.log('WARNING: Multimedia resources not currently supported.');
      readBytes(blockSize);
    };
    
    // Load a Multimedia Resource Link block ("MREL") 
    var readMultimediaResourceLinkBlock = function(blockSize) {
      console.log('WARNING: Multimedia resources not currently supported.');
      readBytes(blockSize);
    };
    
    // Load a Metaclass Dependency block ("MCLD") 
    // This initially populates the metaclass table.
    var readMetaclassDependencyBlock = function(blockSize) {
      var numMetaclasses = readUint16();
      blockSize -= 2;
      
      for (iMetaclass = 0; iMetaclass < numMetaclasses; iMetaclass++) {
        var recordSize = readUint16();
        var nameLength = readUint8();
        var name = readBytes(nameLength);
        console.log('Loading metaclass ' + name);

        var numProperties = readUint16();
        var lenProperties = readUint16();
        for (var iProperty = 0; iProperty < numProperties; iProperty++) {
          var propertyValue = readUint16();
          if (lenProperties > 2) {
            readNullPadding(lenProperties - 2, true);
          }
        }
        
        // TODO: FIGURE OUT WTF IS GOING ON WITH PROPERTIES.
      }
    };
    
    // Load the Symbolic Names Export Block ("SYMD")
    var readSymbolicNamesExportBlock = function(blockSize) {
      /*
      var numEntries = readUint16();
      for (var iEntry = 0; iEntry < numEntries; iEntry++) {
        var symNameLen = readVariableType();
        var symName = readBytes(symNameLen.ofs);
        console.log(symName);
        
        // TODO: Add the symbol to our exports table.
        // TODO: Figure out wtf the exports table is.
      }
      */
      console.log('WARNING: Something wrong with variable type loader. Symbol export disabled for now.');
      readNullPadding(blockSize, true);
    };
    
    // Load the Functional Set Dependency Block ("FSND")
    var readFunctionalSetDependencyBlock = function(blockSize) {
      var numEntries = readUint16();
      for (var iEntry = 0; iEntry < numEntries; iEntry++) {
        var nameLen = readUint8();
        var name = readBytes(nameLen);
        VM_DATA.FUNCTIONS[name] = true;
      }
    };    
    
    // Load the Static Initializer Block ("SINI")
    var readStaticInitializerBlock = function(blockSize) {
      var headerSize = readUint32();
      VM_DATA.staticCodeOffset = readUint32();
      var initializerCount = readUint32();
      
      // Skip remaining header, if any.
      if (headerSize > 12) {
        readBytes(headerSize - 12);
      }
      blockSize -= headerSize;
      
      var byteCount = initializerCount * 6;
      
      VM_DATA.staticPageData = readBytes(byteCount);
      blockSize -= byteCount;
      
      readBytes(blockSize);
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

