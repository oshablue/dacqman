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

const FN_PREFIX = "run_";
const FN_SUFFIX = ".UTR";
const FN_PAD_NZEROES = 4;   // pad values < 999 with leading zeroes up to 4 digits - value should expand digits as necessary


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

  -

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
    this.waveformCounter = 0;
    this.waveformsPerFile = 0;
    this.minChannelNum = 0;
    this.maxChannelNum = 0;
    this.headerByteArray = null;
    this.transducerByteArray = null;

    this.activeFilePath = null;
    this.activeWriteStream = null;
    this.captureWriteStream = null;

    this.inDataBuffer = Buffer.alloc(4095 * 8, 0); // max waveform returned from hardware X 8, init with 0

  //} // end of constructor

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






  this.loadCustomTransducerCalibrationFilesPromise = () => {

    // Alas since we are chaining these, and no closures yet as another route,
    // we just use the parent level items for prefs and the optionsJson

    console.log("loadCustomTransducerCalibrationFilesPromise: ");
    console.log(this.prefs);

    return new Promise((resolve, reject) => {

      try {

        var dir = prefs.customTransducerCalibrationFilesDirectory;
        var dirPkgd = prefs.customTransducerCalibrationFilesDirectoryPackaged;
        if ( dir === dirPkgd ) {
          console.warn(`warning from capture-data.js: your transducer calibration files directory is still set to the packaged sample files.  If your processing methods depend on transducer calibration files, you should probably customize this directory and place your calibration files within that directory, matching the cal wave file names inside of your customized capture-options.json file in the transducers section.  Will proceed using the packages sample cal files.`);
          // we can still proceed ...
        }
        resolve( this.loadCalWaveFiles( dir, this.customCaptureOptionsJson.transducersInfo.calWaveFiles ) );

      } catch (e) {
        console.warn(`Warning: Allowing continuation as this may not be critical, however there was an error in capture-data.js: loadCustomTransducerCalibrationFilesPromise: ${e}.`);
        resolve(false); // continuation allowed, hence resolve used not reject
      }

    }); // end of new Promise

  } // End of: loadCustomTransducerCalibrationFiles






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
        .then( res => { this.loadCustomTransducerCalibrationFilesPromise() })  // should always resolve, really
        .then( () => {
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







  this.loadCalWaveFiles = ( dir, calWaveFnArrayHash ) => {

    return new Promise ( (resolve, reject ) => {
      resolve();
    }); // end of new Promise

  } // End of: loadCalWaveFiles







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









  this.loadTransducerCalibrationFiles = (dir, filenamesArrayJson) => {

    return new Promise ( (resolve, reject) => {

      try {

        filenamesArrayJson.forEach( function (f) {
          console.log(path.join(dir, f));
        });

      } catch (e) {
        console.warn("capture-data.js: loadTransducerCalibrationFiles: warning/error: " + e);
      }

    }); // end of new Promise

  } // End of: loadTransducerCalibrationFiles










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







  this.createCaptureWriteStreamFilePath = () => {

    // padStart is included in ECMAScript 2017
    // for very high file counter values, >9999, this should just expand
    var currentCaptureWriteStreamFileName = FN_PREFIX + '' + this.fileCounter.toString().padStart(FN_PAD_NZEROES, '0') + FN_SUFFIX;
    this.activeFilePath = path.join(directory.toString(), currentCaptureWriteStreamFileName);

  } // End of: createCaptureWriteStreamFilePath






  this.startNewFile = () => {

    // Create filename and open the path
    this.fileCounter = this.fileCounter + 1;      // start from 1, init'd at 0
    this.createCaptureWriteStreamFilePath();

    // Initialize file write stream
    this.captureWriteStream = fs.createWriteStream(this.activeFilePath);
    this.captureWriteStream.setDefaultEncoding('hex');

    // Write header data to file
    console.log("startNewFile: headerByteArray length: " + this.headerByteArray.length);
    this.captureWriteStream.write(this.headerByteArray);

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
      this.startNewFile();
    }

    // Skip buffer rotation and accumulation, let the stream object do that ...
    //inDataBuffer = new Buffer.concat([inDataBuffer, newData]);

    this.writeDataToFile(newData);

  } // End of: ReceiveData










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







// module.exports = CaptureDataFileOutput;
//module.export.CaptureDataFileOutput;
module.exports = {
  CaptureDataFileOutput
};
