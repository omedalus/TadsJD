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
      _curpos += _data.length;
      return retval;
    };


    var readFileHeader = function(data, bytepos) {
      var fileSig = readBytes(VMIMAGE_SIG.length);
      if (fileSig !== VMIMAGE_SIG) {
        throw new TypeError('TADS3 parse error: file signature invalid.', null, _curpos);
      }
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

