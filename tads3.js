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

  var parse;

  (function() { // Parser IIFE
    var VMIMAGE_SIG = "T3-image\015\012\032";
  
    var _curpos = 0;
    var _data = null;

    var readBytes = function(n) {
      if (!_data) { 
        return null; 
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
    
    var readInt16 = function() {
      // t3 bytecode is little-endian.
      var bytes = readBytes(2);
      return bytes.charCodeAt(0) + (bytes.charCodeAt(1) << 8);
    }


    var readFileHeader = function(data, bytepos) {
      var fileSig = readBytes(VMIMAGE_SIG.length);
      if (fileSig !== VMIMAGE_SIG) {
        throw new TypeError('TADS3 parse error: file signature invalid.', null, _curpos);
      }
      
      var fileVersionNum = readInt16();

      if (fileVersionNum !== 1) {
        throw new TypeError('TADS3 parse error: does not support version ' + 
            fileVersionNum, null, _curpos);
      }

      readNullPadding(32, true);

      var fileTimestamp = readBytes(24);
      console.log(fileTimestamp);
    };
    
    parse = function(data) {
      _data = data;
      
      readFileHeader(data, 0);
    };
    
  }()); // Close parser IIFE

  tads3 = function(t3binarydata, divselector) {
    parse(t3binarydata);
  };

}()); // Close the master IIFE

