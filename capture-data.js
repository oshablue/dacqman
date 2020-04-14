/*

License: See LICENSE file - MIT (modified slightly)

Author/Copyright 2020/Present:
OshaBlue LLC / Nisch S. / NKS

Limitations/Caveats:
Please see overall README and project notes indicating in particular:
- This is a very rough test/demo project
- Use at your own risk
- Probably lots of improvements and clean up needed
- Use with OshaBlue hadrware for UT/NDT ultrasonic scanning hardware

PURPOSE:

Implement some custom file writing and capture data routines for capturing data
in this demo project.

ASSUMPTIONS:

Invoked within a master/parent electron process hence ipcRenderer, eg to grab prefs.
Is that silly?  Probably.  Optional ALT to create pass into object from caller.


*/


const electron = require('electron');
const {ipcRenderer} = electron;

// TODO I don't think this is right
const { dialog } = require('electron').remote;

const fs = require('fs');
const path = require('path');
const strftime = require('strftime');
const csv = require('csv');           // some issues with just csv-parse so using the whole csv package
//const parse = require('csv-parse/lib/parse');

// These now come from the additionalFileInfo in the capture-options.json
//const FN_PREFIX = "run_";
//const FN_SUFFIX = ".UTR";
//const FN_PAD_NZEROES = 4;   // pad values < 999 with leading zeroes up to 4 digits - value should expand digits as necessary


/*


  Instantiate with, eg:

  var captDataFO = new CaptureDataFileOutput({
    parentElementIdName: "chart",
    chartBuffer: singleChartBuf
  });

  */




/*

 TODO LIST

 - Add reminder about not yet set custom cal files directory
   and thus the consequences?  Along with information about
   how this may or may not matter, depending on the processing mode
   used.

 - Add pref for above to not show reminders

 - Add overall a notice category tagged / color coded pane to the
  whole I/F ?  That would be cool - a la old RoR site work


 */


 /*

  References:

  - Private vs public object/class methods:
    https://stackoverflow.com/questions/55611/javascript-private-methods
    - Here, in this code we are using all public methods to keep with pure
      and simpler JS
      whereas indeed we could lean on nodejs module loading and thus properly
      create private/public functions per example in above link which is a little
      more natural to me, but requires nodejs usage only (hmmm)

  - https://stackoverflow.com/questions/48920135/es6-functions-arrow-functions-and-this-in-an-es6-class

  - https://ponyfoo.com/articles/es6-promises-in-depth

  - https://stackoverflow.com/questions/31342290/es6-classes-default-value

  - https://stackoverflow.com/questions/32657516/how-to-properly-export-an-es6-class-in-node-4

  - Great calculator - various interpretations of binary values:
    https://www.scadacore.com/tools/programming-calculators/online-hex-converter/

  - https://stackoverflow.com/questions/17217736/while-loop-with-promises

  - https://stackoverflow.com/questions/45348955/using-await-within-a-promise


  */


// NodeJs 12.nnnnnnn etc.
// Yes ES6 supported
//

/*
function CaptureDataFileOutput({
  directory = '',
  numberOfWaveformsPerFile = 600,   // 600 / 4 XDs = 150 scans
} = {}) {
*/



// ES6
class CaptureDataFileOutput {

  constructor ({

    // default param values
    directory = '',
    numberOfWaveformsPerFile = 600

  } = {}) {

    // constructor body

    this.directory = directory;
    this.numberOfWaveformsPerFile = numberOfWaveformsPerFile;

    console.log("CaptureDataFileOutput instantiated with output directory: " + this.directory + " and file splits at " + this.numberOfWaveformsPerFile + " waveforms.");

    this.prefs = null;
    this.customCaptureOptionsJson = null;
    this.readyToCapture = false;

    this.fileCounter = 0;
    this.currentSeriesIndex = null;
    this.waveformCounter = 0;
    this.waveformsPerFile = 0;
    this.minChannelNum = 0;
    this.maxChannelNum = 0;
    this.transducerCalibrationWaveformArray = null;
    this.headerByteArray = null;
    this.transducerByteArray = null;

    this.fileCapturePrefix = null;
    this.fileCaptureExtWithDot = null;
    this.fileCaptureSeqNumDigits = null;
    this.fileCaptureMidFixPrefix = null;
    this.fileCaptureMidFixSeqNumDigits = null;
    this.fileCaptureMidFixSuffix = null;

    this.activeFilePath = null;
    this.activeWriteStream = null;
    this.duplicateFileNamingMidFix = null;              // MidFix = after the prefix, indicating a series number, but before the file sequence number
    this.duplicateMidFixSeriesNum = 0;
    this.captureWriteStream = null;

    this.inDataBuffer = Buffer.alloc(4095 * 8, 0); // max waveform returned from hardware X 8, init with 0


  // https://stackoverflow.com/questions/11707698/how-to-know-which-javascript-version-in-my-nodejs
  // https://node.green/
  // node -p process.versions.v8
  /*try {
    var k = new Map();
    console.log("ES6 supported!!")
  } catch(err) {
    console.log("ES6 not supported :(")
  }
  try {
    var k = new HashMap();
    console.log("ES100 supported!!")
  } catch(err) {
    console.log("ES100 not supported :(")
  }*/


  // still inside constructor
  // run/parse main project doesn't seem to like:
  // just: WaveformsPerFile = () => {
  // outside of the constructor and crashes the parsing
  // at the level of require this file
  // https://stackoverflow.com/questions/48920135/es6-functions-arrow-functions-and-this-in-an-es6-class
  this.WaveformsPerFile = () => {
    return this.waveformsPerFile;
  }








  // was this. however this arrow notation does the same
  this.LoadCaptureOptions = () => {

    this.readyToCapture = false;
    this.customCaptureOptionsJson = null;

    // DUMB? Is this implementation dumb? (below...)

    return new Promise ((resolve, reject) => {
      getPrefsPromise()
        .then( prefs => {
          this.prefs = prefs;
          return prefs;
        })
        .then( prefs => loadCustomCaptureOptionsPromise(prefs) )
        .then( customCaptureOptionsJson => {
          this.customCaptureOptionsJson = customCaptureOptionsJson;
          return customCaptureOptionsJson;
        })
        .then( res => {
          this.loadStuffFromCaptureOptionsJsonIntoInstance();
          return res;
        })
        .then( res => {
          // Yes return is required such that .then returns
          // a promise and thus the next .then waits on the fulfillment
          // of this previous promise prior to executing
          var res = this.loadCustomTransducerCalibrationFilesPromise();
          return res;
        })  // should always resolve, because it's optional and perhaps legacy compat but no longer used mostly
        .then( arr => {
          this.transducerCalibrationWaveformArray = arr;
          console.log("capture-data.js: stored loadCustomTransducerCalibrationFilesPromise result into transducerCalibrationWaveformArray: ");
          console.log(arr);
          return arr;
        })
        .then( res => {
          if ( this.customCaptureOptionsJson ) {
            this.initializeFileWritingData( this.customCaptureOptionsJson );
            this.readyToCapture = true;
            console.log("capture-data.js: readyToCapture: " + this.readyToCapture);
            resolve(true);
          } else {
            reject("Error loading prefs and customCaptureOptionsJson from file: customCaptureOptionsJson not set or is still null");
          }
        })
        .catch ( e => {
          console.error("Error loading prefs and customCaptureOptionsJson from file: " + e);
          reject(false);
        })
    })

  } // End of: LoadCaptureOptions








  this.loadStuffFromCaptureOptionsJsonIntoInstance = () => {

    return new Promise ( (resolve, reject ) => {

      var json = this.customCaptureOptionsJson.additionalFileInfo.fileNaming;

      this.fileCapturePrefix = json.prefix;
      this.fileCaptureExtWithDot = json.extensionWithDot;
      this.fileCaptureSeqNumDigits = parseInt(json.padZeroesInSequenceNum);

      json = this.customCaptureOptionsJson.additionalFileInfo.duplicateFileNaming;

      this.fileCaptureMidFixPrefix = json.midFixPrefix;
      this.fileCaptureMidFixSeqNumDigits = json.numDigits;
      this.fileCaptureMidFixSuffix = json.midFixSuffix;

      resolve(true);

    }); // end of new Promise

  } // End of: loadStuffFromCaptureOptionsJsonIntoInstance









  // was this however = () => { } does the same
  this.CheckOutputDirectory = () => {

    console.log("checkOutputDirectory: checking writable: " + this.directory);

    console.log("this.readyToCapture:");
    console.log(this.readyToCapture);

    return new Promise( (resolve, reject) => {

      // TEST:
      // To break this, remove "toString()" from the fs.access call for example

      try {
        // Wrapping because just adding a catch doesn't seem to fire correctly - probably I'm just missing something
        fs.access(this.directory.toString(), fs.constants.W_OK, err => {
          if ( err ) {
            console.error("capture-data.js: can't write to output directory " + err);
            this.readyToCapture = false;
            //reject("Error testing if output directory is writable.");
            reject(false);
          } else {
            console.log("capture-data.js: output directory is writable.");
            console.log("capture-data.js: checkOutputDirectory: about to resolve true");
            resolve(true);
          }
        });
      } catch ( e ) {
        console.error("capture-data.js: fs.access: error on testing for writable output directory: " + e + " for this.directory: " + JSON.stringify(this.directory));
        this.readyToCapture = false;
        console.log("capture-data.js: try/catch error: " + e + " with output directory: " + this.directory);
        reject(false);
      };


    });

  } // End of: checkOutputDirectory








  // we should probably rework this to a promise ... for sequential build before indicate a successful construction and load event
  this.initializeFileWritingData = ( optionsJson ) => {

    try {

      // Put in its own error catch block?
      this.initializeFileWritingTransducerData( optionsJson );

      this.waveformsPerFile = parseInt(optionsJson.headerData.transducersNum.value)
                       * parseFloat(optionsJson.additionalFileInfo.readingsPerInch.value)
                       * parseFloat(optionsJson.headerData.runLengthInches.value);
      console.log("waveformsPerFile calculated from options to be: " + this.waveformsPerFile);

      this.minChannelNum = 1;
      this.maxChannelNum = parseInt(optionsJson.headerData.transducersNum.value);

      var headerSize = parseInt(optionsJson.additionalFileInfo.offsetToFirstTransducerRecord.value);
      console.log("offsetToFirstTransducerRecord.value: " + headerSize);
      this.headerByteArray = Buffer.alloc(headerSize); // Buffer is also Uint8Array - https://nodejs.org/api/buffer.html#buffer_buffers_and_typedarrays


      var i16a;
      var x;
      var posn = 0;   // or we can reference the indexByteStart and indexByteStop from the options
      var len;

      // TODO rather than each entry, we could just run through all and use the
      // type and indexByteStart/Stop fields to properly place all the header data

      // Skip finding the length, and just use the constant chars
      // because that is how it is actually implemented in customer software
      x = Buffer.from(optionsJson.headerData.runFileTypeId.value);
      x.copy(this.headerByteArray, posn);
      posn = posn + parseInt(optionsJson.headerData.runFileTypeId.lengthBytes); // or could length of x

      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.legacyHeaderLengthPlaceholder.value,
        posn
      );

      // TODO UPDATE IN HEADER on each file creation
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.runId.value,
        posn
      );

      // TODO - get the actual Tank ID at construction or init
      len = parseInt(optionsJson.headerData.tankId.lengthBytes);
      x = Buffer.from(
        optionsJson.headerData.tankId.value.toString()
          .substr(0, len).padEnd(len, ' ') // pad with space char
      );
      x.copy(this.headerByteArray, posn);
      posn = posn + x.length;

      // datetimestamp length write
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.timestamp.lengthBytes,
        posn
      );

      // TODO UPDATE IN HEADER on each file creation
      // datetimestamp itself
      var d = strftime('%d/%m/%Y %H:%M:%S', new Date());
      len = parseInt(optionsJson.headerData.timestamp.lengthBytes)
      x = Buffer.from(d.substr(0, len));
      x.copy(this.headerByteArray, posn);
      posn = posn + x.length;
      console.log("capture-data.js: initializeFileWritingData: formatted timestamp is: " + d.substr(0, len));

      // transducer count
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.transducersNum.value,
        posn
      );

      // sampleRateMHz
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.sampleRateMHz.value,
        posn
      );

      // https://www.scadacore.com/tools/programming-calculators/online-hex-converter/

      // runLengthInches
      posn = this.float32JsonValIntoHeaderArray(
        optionsJson.headerData.runLengthInches.value,
        posn
      );

      // runSpeedInchesPerSec
      posn = this.float32JsonValIntoHeaderArray(
        optionsJson.headerData.runSpeedInchesPerSec.value,
        posn
      );

      // minimumRecordLength
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.minimumRecordLength.value,
        posn
      );

      // TODO this should be replaced with actual lengths of XD records (cal files etc)
      // offsetToFirstCaptureWaveformBaseOne
      posn = this.int32JsonValIntoHeaderArray(
        optionsJson.headerData.offsetToFirstCaptureWaveformBaseOne.value,
        posn
      );

      // lengthOfWaveformRecord
      posn = this.int32JsonValIntoHeaderArray(
        optionsJson.headerData.lengthOfWaveformRecord.value,
        posn
      );

      // pulseTypeAndAnalyzeMode
      posn = this.int16JsonValIntoHeaderArray(
        optionsJson.headerData.pulseTypeAndAnalyzeMode.value,
        posn
      );

      // At present the end of the header isn't used - so we put an indicator to help
      // identify that this is a different generation and source for these file types
      var msg = Buffer.from('Custom File Format Adapted to DacqMan and HDL-0108-RSCPT and Family. OshaBlue LLC.');
      msg.copy(this.headerByteArray, (this.headerByteArray.length - msg.length));
      // Yes, verified byte positioning exact up to byte 1023 (base 0) from hex output

    } catch (e) {
      console.warn("WARNING: Allowing continuance of capture, however something went wrong in initializeFileWritingData in capture-data.js: " + e);
    }

  } // End of: initializeFileWritingData









  this.initializeFileWritingTransducerData = ( optionsJson ) => {

    var headerSize = parseInt(optionsJson.additionalFileInfo.offsetToFirstTransducerRecord.value);
    var offsetToFirstCaptureWaveformBaseOne =
      parseInt(optionsJson.headerData.offsetToFirstCaptureWaveformBaseOne.value);
    // parseInt should be 32-bit anyway

    var lenXdByteArr = offsetToFirstCaptureWaveformBaseOne - headerSize;
    // eg 5860 - 1024 = 4836

    // Actual length should be computed from cal file lengths and data
    // [0 .. 39] XD header info - always the same
    // [40 .. 4xCalWaveLengthInPoints-1] because all values are "single" = 4-byte float
    this.transducerByteArray = Buffer.alloc(lenXdByteArr);
    console.log("transducer data section byte length is: " + lenXdByteArr);

    // start index = headerSize => eg 1024
    // stop index = headerSize + lenXdByteArr - 1
    //            = 1024 + 4836 = 5860 - 1 = 5859 => yes this matches sample file
    //            ie transducer data ends at byte 5859 such that 5860 byte index = first byte of waveform record

    // For each transducer there is a constant-length header
    var len = parseInt(optionsJson.transducersInfo.header.lengthBytes);
    var xdHeader = Buffer.alloc(len);
    console.log("created xdHeader buffer len of: " + len + " bytes");



  } // End of: initializeFileWritingTransducerData









  this.loadTransducerCalibrationFiles = (dir, filenamesArrayJson, firstLineToReadFrom) => {

    // Called by a parent that organizes the directory get and check
    // and the filenames
    // This file does the actual work

    // https://stackoverflow.com/questions/31413749/node-js-promise-all-and-foreach
    // https://csv.js.org/parse/recipies/file_interaction/

    return new Promise ( (resolve, reject) => {

        // Order filenames by transducer name/number keys
        // https://stackoverflow.com/questions/5467129/sort-javascript-object-by-key
        // We order just in case ... though it would appear that order
        // is properly preserved anyway -- see link and ES6/2015
        var ordered = {};
        Object.keys(filenamesArrayJson).sort().forEach(function(key) {
          ordered[key] = filenamesArrayJson[key];
        });
        var calFps = []
        for ( var key in ordered ) {
          calFps.push(path.join(dir, ordered[key]));
        };

        var actions = calFps.map( (fp) => {
          // yes return is needed to populate the results array
          return this.putTransducerCalibrationWaveformIntoArray(fp, firstLineToReadFrom);
        });

        var results = Promise.all(actions);

        results.then(data => {
          //console.log(data);
          resolve(results); // resolve?
        });

    }); // end of new Promise

  } // End of: loadTransducerCalibrationFiles








  this.putTransducerCalibrationWaveformIntoArray = (fp, firstLineToReadFrom) => {

    return new Promise( ( resolve, reject ) => {

      var recs = [];
      var content = null;
      try {
        content = fs.readFileSync(fp);
      } catch (e) {
        console.warn(`putTransducerCalibrationWaveformIntoArray: fileReadSync error: ${e} - resolving false.`);
        resolve(false);
      }

      if ( content ) {

        var options = {
          columns: false,
          from_line: firstLineToReadFrom
        };

        csvParseAsync( content, options )
          .then( recs => {
            if ( recs ) {
              resolve(recs);
            } else {
              resolve(false);
            }
          })
          .catch( (e) => {
            console.log("error: " + e);
            resolve(false);
          });

      }

    }); // end of new Promise

  } // End of: putTransducerCalibrationWaveformIntoArray










  // https://stackoverflow.com/questions/22519784/how-do-i-convert-an-existing-callback-api-to-promises
  function csvParseAsync(content, options) {

    return new Promise( function ( resolve, reject ) {

      csv.parse(content, options, function ( err, data ) {
        if ( err ) {
          console.log("csvParseAsync: error: " + err);
          resolve(false);
        } else {
          var recs = [];
          data.forEach(function (rec) {
            recs.push(parseFloat(rec[0])); // these will be Array(1)
          });
          recs = [].concat.apply([], recs);
          resolve(recs);
        }
      })

    });

  } // end of csvParseAsync












  this.loadCustomTransducerCalibrationFilesPromise = () => {

    // Alas since we are chaining these, and no closures yet as another route,
    // we just use the parent level items for prefs and the optionsJson

    console.log("loadCustomTransducerCalibrationFilesPromise: ");
    //console.log(this.prefs);

    return new Promise((resolve, reject) => {

      //try {

        var dir = prefs.customTransducerCalibrationFilesDirectory;
        var dirPkgd = prefs.customTransducerCalibrationFilesDirectoryPackaged;
        if ( dir === dirPkgd ) {
          // This is a really long warning and info message:
          console.warn(`warning from capture-data.js: your transducer calibration files directory is still set to the packaged sample files.  If your processing methods depend on transducer calibration files, you should probably customize this directory and place your calibration files within that directory, matching the cal wave file names inside of your customized capture-options.json file in the transducers section.  Will proceed using the packages sample cal files.`);
          // we can still proceed ...
        }
        this.loadTransducerCalibrationFiles(
          dir,
          this.customCaptureOptionsJson.transducersInfo.calWaveFiles,
          parseInt(this.customCaptureOptionsJson.transducersInfo.calWaveFilesOptions.firstLineToReadFrom)
        ).then( res => {
          resolve(res);
        })

      /*} catch (e) {
        console.warn(`Warning: Allowing continuation as this may not be critical, however there was an error in capture-data.js: loadCustomTransducerCalibrationFilesPromise: ${e}.`);
        resolve(false); // continuation allowed, hence resolve used not reject
      }*/

    }); // end of new Promise

  } // End of: loadCustomTransducerCalibrationFilesPromise











  this.int16JsonValIntoHeaderArray = ( val, posn ) => {

    // https://stackoverflow.com/questions/7744611/pass-variables-by-reference-in-javascript
    // However, note that even creating an obj with eg an int value, like obj.buf, obj.posn, etc.
    // the int value
    // behaved more as by val - thus origin not changed - nor was the buffer afterall anyway

    // Specific helper function
    // Assumes errors caught at caller/parent level

    var i16a = new Int16Array(1);
    i16a[0] = parseInt(val);
    var x = Buffer.from(i16a.buffer);
    //console.log("int16 buffer: ");
    //console.log(x);
    x.copy(this.headerByteArray, posn);
    posn = posn + x.length; // 2

    console.log("int16JsonValIntoHeaderArray posn exit value: " + posn);

    return posn;

  } // End of: int16JsonValIntoArray










  this.int32JsonValIntoHeaderArray = ( val, posn ) => {

    // https://stackoverflow.com/questions/7744611/pass-variables-by-reference-in-javascript
    // However, note that even creating an obj with eg an int value, like obj.buf, obj.posn, etc.
    // the int value
    // behaved more as by val - thus origin not changed - nor was the buffer afterall anyway

    // Specific helper function
    // Assumes errors caught at caller/parent level

    var i32a = new Int32Array(1);
    i32a[0] = parseInt(val);
    var x = Buffer.from(i32a.buffer);
    //console.log("int16 buffer: ");
    //console.log(x);
    x.copy(this.headerByteArray, posn);
    posn = posn + x.length; // 4

    //console.log("int32JsonValIntoHeaderArray posn exit value: " + posn);

    return posn;

  } // End of: int32JsonValIntoArray









  this.float32JsonValIntoHeaderArray = ( val, posn ) => {

    // https://stackoverflow.com/questions/7744611/pass-variables-by-reference-in-javascript
    // However, note that even creating an obj with eg an int value, like obj.buf, obj.posn, etc.
    // the int value
    // behaved more as by val - thus origin not changed - nor was the buffer afterall anyway

    // Specific helper function
    // Assumes errors caught at caller/parent level

    var f32a = new Float32Array(1);
    f32a[0] = parseFloat(val);
    var x = Buffer.from(f32a.buffer);
    console.log("float32 buffer: ");
    console.log(x);
    x.copy(this.headerByteArray, posn);
    posn = posn + x.length;   // 4

    console.log("float32JsonValIntoHeaderArray posn exit value: " + posn);

    return posn;

  } // End of: float32JsonValIntoArray











  this.getCurrentMidFix = () => {

    var json = this.customCaptureOptionsJson.additionalFileInfo.duplicateFileNaming;

    if ( this.currentSeriesIndex < 1 ) {

      return '';

    } else {

      var defMfxPrefix = json.midFixPrefix || '';
      var defMfxSuffix = json.midFixSuffix || '';
      var d = json.numDigits || '';

      var mfx = defMfxPrefix
        + this.currentSeriesIndex.toString().padStart(d, '0')
        + defMfxSuffix;

      console.log("capture-data.js: getCurrentMidFix: " + mfx);

      return mfx;

    }

  } // End of: getCurrentMidFix










  this.getCurrentSuffix = () => {

    var n = this.fileCounter.toString()
      .padStart(parseInt(this.fileCaptureSeqNumDigits), '0')
      + this.fileCaptureExtWithDot;

    return n;

  } // End of: getCurrentSuffix









  this.filenameMidFixFix = ( directory, filenameThatExistsAlready ) => {

    return new Promise( (resolve, reject) => {

      var fn = null;
      var fp = null;

      // Check that a series has not already been set > 0
      // If it has been and we are here then we do NOT increment the series number
      // rather we go to the last resort
      if ( this.currentSeriesIndex > 0 ) {

        console.error("capture-data.js: filenameMidFixFix: warning: "
          + "the file: " + filenameThatExistsAlready + " has been determined "
          + "to exist already, but the series index has already been set for the "
          + "midFix implementation to " + this.currentSeriesIndex.toString() + "."
          + "To prevent data overwrite this should normally never happen, unless "
          + "there is something buggy happening or files are getting moved around "
          + "manually during capture."
          + "This can be prevented by creating a fresh directory for capture each run series "
          + "among other precautions."
        );

        // Even adding subsequent suffixes ... no go.
        // This really shouldn't happen, due to the codeflow.
        // So we just throw hands up in the air

        this.SendUiError("Big problem: Couldn't create a write file for the capture output. "
          + "That means that your data is not getting stored!!!");

        resolve(false);

      } else {

        try {

          // Find the last ordered series number, if any, that exists in the directory
          // https://stackoverflow.com/questions/21319602/find-file-with-wild-card-matching
          var files = fs.readdirSync(directory)
            .filter(fn => fn.endsWith(this.fileCaptureExtWithDot))
            .filter(fn => fn.includes(this.fileCaptureMidFixPrefix));

          console.log("filenameMidFixFix: files found: filtered for: " + this.fileCaptureMidFixPrefix);
          console.log(files);

          if ( files.length < 1 ) {

            // if none, set to padded 1 -- also set this.seqNum to this value of 1
            this.currentSeriesIndex = 1;

          } else {

            // if some, sort and then take the last/highest and then add 1 and then set
            // this seqnum to that next value
            //https://stackoverflow.com/questions/15804496/node-js-string-array-sort-is-not-working
            files.sort((obj1, obj2) => {
              return obj1.localeCompare(obj2);
            });

            console.log("filenameMidFixFix: files found: filtered for: " + this.fileCaptureMidFixPrefix);
            console.log(files);

            // Extract the series number
            var start = this.fileCapturePrefix.length + this.fileCaptureMidFixPrefix.length;  // base 1, so we get the next index
            var numStr = files[files.length - 1].substring(start).match(/[0-9]+/);
            var n = parseInt(numStr);
            console.log(`Last number of series in midfixes in directory is: ${n}`);
            // Set this instance's series index number - as above (already noted)
            this.currentSeriesIndex = n + 1;

          } // end of handling case of more than 0 series files found

          // Use the getMidFix fcn to grab the assembled midFix from the stored values
          var mfx = this.getCurrentMidFix();

          // add a fcn to assemble the whole fn? (not fp)
          // If we are in this function we start with a whole new file counter
          // fileCounter increment is handled elsewhere in startNewFile
          fn = this.fileCapturePrefix.toString() + mfx + this.getCurrentSuffix();
          console.log(`created new series filename: ${fn}`);

          // assemble the whole fp or create and use a fcn to do so
          fp = path.join(directory, fn);

          // resolve the new file path generated
          resolve(fp);

        } catch ( e ) {

          console.error("This is a fairly big problem: "
            + "error during creating a next series filename to store data: "
            + e
          );
          this.SendUiError("Big problem: Couldn't create a series/midFix filename to store data! That is BAD!");
          resolve(false);

        } // end of catch

      } // end of currentSeriesIndex not yet set to more than 0

    }); // end of new Promise

  } // End of: filenameMidFixFix








  this.createCaptureWriteStreamFilePath = () => {

    // padStart is included in ECMAScript 2017
    // for very high file counter values, >9999, this should just expand

    var fp = null;
    var testFn = null;
    var currentMfx = this.getCurrentMidFix();

    return new Promise ( (resolve, reject) => {

      var testFn = this.fileCapturePrefix + ''
        + currentMfx
        + this.getCurrentSuffix();
        //    .padStart(this.fileCaptureSeqNumDigits, '0')
        //    + this.fileCaptureExtWithDot;

      console.log("capture-data.js: createCaptureWriteStreamFilePath: new file filename: " +
        testFn);

      fp = path.join(this.directory.toString(), testFn);

      fileExists(fp)        // returns true/false regarding whether file exists - plain
        .then( res => {
          if ( res ) {
            // TODO we need to warn if series number has already been set
            // and yet now a file with the same name exists anyway
            // such that on the remaining filename generation function tree
            // something will be appended to the filename to get a fresh file
            // but the series exactness format will be corrupted then.
            // TODOBIGLT: Perhaps we need a file gen and overall summary report
            // as json etc. to keep as log(s)

            // Use MidFix to create filename
            console.log("Since capture file exists, creating filenames with MidFix inserted, so that we don't overwrite any data.");
            this.filenameMidFixFix( this.directory.toString(), testFn )
              .then( res => {
                if ( res ) {
                  // The filepath
                  this.activeFilePath = res;
                  resolve(true);
                } else {
                  // False - this is a big problem - capture output is not getting stored.
                  console.error("capture-data.js: createCaptureWriteStreamFilePath: error: "
                    + "Not able to create a write stream! Your data is not getting captured!");

                  resolve(false);

                  throw new Error("capture-data.js: Yep, we are throwing another ERROR because "
                    + "it is bad if we can't create a write file to store your data!");
                }
              })
              .catch( e => {
                console.warn("capture-data.js: createCaptureWriteStreamFilePath: filenameMidFixFix.then: error: " + e);
                resolve(false);
              });
          } else {
            // use basic filename
            this.activeFilePath = fp;
          }
          resolve(true); // we just assume here that the situation was handled at this level
        })
        .catch( e => {
          console.warn("createCaptureWriteStreamFilePath: error: " + e);
          resolve(false);
        });

    }); // end of new Promise

  } // End of: createCaptureWriteStreamFilePath








  this.startNewFile = () => {

    // We don't want to overwrite data
    // so ... here the file write flag is presented with "x" appended, as in,
    // don't overwrite if exists
    // And the error event is added.
    // We need also to check that the file does not exist and then
    // create/write -- or if it does, use the appropriate midFix addition
    // in the filepath creation routine

    return new Promise ( (resolve, reject) => {

      // Create filename and open the path
      this.fileCounter = this.fileCounter + 1;      // start from 1, init'd at 0
      this.createCaptureWriteStreamFilePath()
        .then( res => {

          // Initialize file write stream
          try {

            console.log("about to createWriteStream: " + this.activeFilePath);
            this.captureWriteStream = fs.createWriteStream(
              this.activeFilePath,
              {
                flags: 'wx'   // open for write but do not overwrite
              }
            );
            this.captureWriteStream.setDefaultEncoding('hex');
            this.captureWriteStream.on('error', function(e) {
              console.error("capture-data.js: captureWriteStream error event: " + e);
              this.readyToCapture = false;
            });

            // Write header data to file
            console.log("startNewFile: headerByteArray length: " + this.headerByteArray.length);
            this.captureWriteStream.write(this.headerByteArray);

            resolve(true);

          } catch (e) {
            // write is async, so this will not immediately fire
            // so the exception happens somewhere else
            console.error("capture-data.js: startNewFile: there was an error opening a capture file for output: " + e);
            this.readyToCapture = false;
            resolve(false);

          }
        }) // end of then( )

      }); // end of new Promise


  } // End of: startNewFile









  this.writeDataToFile = ( buf ) => {

    this.captureWriteStream.write(buf, err => {
      if ( err ) {

        console.error("capture-data.js: writeDataToFile: error: " + err);

        // Set readyToCapture to false? No. Let's default to trying to allow
        // continuation.  And just output the issue only.

      }
    });

  } // End of: writeDataToFile









  this.ReceiveData = ( newData ) => {

    if ( !this.readyToCapture ) {
      console.warn("capture-data.js: this.ReceiveData: Warning: readyToCapture is false." );
    }

    if ( this.fileCounter < 1 || this.waveformCounter > this.waveformsPerFile ) {
      this.startNewFile()
        .then ( res => {
          if ( res ) {
            this.writeDataToFile(newData);
          } else {
            console.warn("capture-data.js: ReceiveData: starting new file didn't work: can't write to anything." + res);
          }
        })
        .catch ( e => {
          console.warn("capture-data.js: ReceiveData: error: " + e);
        })
    } else {
      this.writeDataToFile(newData);
      // TODO track whether things have init'd ok and we can actually write, like above?
    }



  } // End of: ReceiveData







  this.SendUiError = ( errorMsg ) => {

    // Alternately, we could also just store UI
    // errors in this instance and allow UI to poll and grab

    ipcRenderer.send('error:uierror', "capture-data.js: error to UI: " + errorMsg);

  } // End of: SendUiError






  this.SendUiWarn = ( warnMsg ) => {

    // See note for SendUiError too

    ipcRenderer.send('error:uiwarn', "capture-data.js: warning to UI: " + warnMsg);

  } // End of: SendUiWarn





} // end of constructor


} // End of: class CaptureDataFileOutput // function CaptureDataFileOutput












  // Get prefs
  // Be careful with sendSync - even though we need it here to guarantee the
  // return of the prefs for next code, if there is a hang up, reload and quit
  // stop working and you need for force quit somehow (Ctrl-c command line
  // or some app force quit menu items somewhere ... apparently)
  let getPrefsPromise = () => {
    return new Promise((resolve, reject) => {
      prefs = ipcRenderer.sendSync('prefs:getPrefs') || {};
      console.log("Prefs: " + JSON.stringify(prefs));
      if ( !prefs ) {
        reject("getPrefsPromise: failed to get prefs from within capture-data.js / CaptureDataFileOutput");
      } else {
        resolve(prefs);
      }
    });
  }


  let loadCustomCaptureOptionsPromise = (prefs) => {

    // TODO there is probably a problem with the try/catch inside the promise
    return new Promise((resolve, reject) => {

      // What happens if custom file and user deletes it?
      var customCaptureOptionsFilePath = prefs.customCaptureOptionsFilePath || '';
      fs.stat(customCaptureOptionsFilePath || '', function (err, stat) {
        if ( !err ) {
          console.log("Loading customCaptureOptionsFilePath: " + customCaptureOptionsFilePath);
          customCaptureOptionsJson = require(customCaptureOptionsFilePath) || '';
          resolve(customCaptureOptionsJson);
        } else {
          console.log("Filepath in preferences for customCaptureOptionsFilePath, " + customCaptureOptionsFilePath + ", does not exist ... defaulting to packaged fallback");
          try {
            customCaptureOptionsJson = require(prefs.customCaptureOptionsFilePathPackaged);
            resolve(customCaptureOptionsJson);
          } catch (e) {
            console.log("Problem loading customCaptureOptionsFilePathPackaged..." + e);
            customCaptureOptionsJson = JSON.parse("{}");
            console.log(customCaptureOptionsJson);
            reject(customCaptureOptionsJson);
          }
        }
      }); // end of fs.stat

    }); // end of new Promise

  } // End of: loadCustomCaptureOptionsPromise







  let fileExists = (path) => {

    return new Promise( (resolve, reject) => {

      fs.stat(path || '', function (err, stat) {
        if ( !err ) {
          // File exists
          console.log("Looking for existing file path: " + path + " ... it exists!");
          resolve(true);
        } else {
          // File does not exist
          // If no file exists, we get here with a file doesn't exist error
          console.warn("capture-data.js: fileExists: Error on fs.stat: " + err);
          resolve(false);
        }
      });

    }); // end of new Promise

  } // End of: fileExists








// module.exports = CaptureDataFileOutput;
//module.export.CaptureDataFileOutput;
module.exports = {
  CaptureDataFileOutput
};
