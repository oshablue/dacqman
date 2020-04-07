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


function CaptureDataFileOutput({
  directory = '',
  numberOfWaveformsPerFile = 600,   // 600 / 4 XDs = 150 scans
  title = ""
} = {}) {

  this.directory = directory;
  this.numberOfWaveformsPerFile = numberOfWaveformsPerFile;

  var doRenderLoops = false;
  var freshData = false;

  console.log("CaptureDataFileOutput instantiated with output directory: " + this.directory + " and file splits at " + numberOfWaveformsPerFile + " waveforms.");

  var prefs = null;
  var customCaptureOptionsJson = null;
  var readyToCapture = false;

  var fileCounter = 0;
  var waveformCounter = 0;
  var waveformsPerFile = 0;
  var minChannelNum = 0;
  var maxChannelNum = 0;
  var headerByteArray = null;
  var activeFilePath = null;
  var activeWriteStream = null;

  var inDataBuffer = Buffer.alloc(4095 * 8, 0); // max waveform returned from hardware X 8, init with 0




  this.WaveformsPerFile = function() {
    return waveformsPerFile;
  }











  this.LoadCaptureOptions = () => {

    readyToCapture = false;
    customCaptureOptionsJson = null;

    return new Promise ((resolve, reject) => {
      getPrefsPromise()
        .then(prefs => loadCustomCaptureOptionsPromise(prefs))
        .then( function(customCaptureOptionsJson) {
          if ( customCaptureOptionsJson ) {
            initializeFileWritingData( customCaptureOptionsJson );
            readyToCapture = true;
            console.log("capture-data.js: readyToCapture: " + readyToCapture);
            resolve(readyToCapture);
          } else {
            reject("Error loading prefs and customCaptureOptionsJson from file: customCaptureOptionsJson not set or is still null");
          }
        })
        .catch ( e => {
          console.log("Error loading prefs and customCaptureOptionsJson from file: " + e);
          reject("LoadCaptureOptions: error: " + e);
        })
    })

  } // End of: LoadCaptureOptions





  this.CheckOutputDirectory = function() {

    return checkOutputDirectory();

  }




  var checkOutputDirectory = () => {

    console.log("checkOutputDirectory: checking writable: " + this.directory);

    return new Promise( (resolve, reject) => {

      // TEST:
      // To break this, remove "toString()" from the fs.access call for example

      try {
        // Wrapping because just adding a catch doesn't seem to fire correctly - probably I'm just missing something
        fs.access(this.directory.toString(), fs.constants.W_OK, err => {
          if ( err ) {
            console.error("capture-data.js: can't write to output directory " + err);
            readyToCapture = false;
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
        readyToCapture = false;
        console.log("capture-data.js: try/catch error: " + e + " with output directory: " + this.directory);
        reject(false);
      };


    });

  } // End of: checkOutputDirectory






  // we should probably rework this to a promise ... for sequential build before indicate a successful construction and load event
  var initializeFileWritingData = function ( optionsJson ) {

    try {

      waveformsPerFile = parseInt(optionsJson.headerData.transducersNum.value)
                       * parseFloat(optionsJson.additionalFileInfo.readingsPerInch.value)
                       * parseFloat(optionsJson.headerData.runLengthInches.value);
      console.log("waveformsPerFile calculated from options to be: " + waveformsPerFile);

      minChannelNum = 1;
      maxChannelNum = parseInt(optionsJson.headerData.transducersNum.value);

      var headerSize = parseInt(optionsJson.additionalFileInfo.offsetToFirstTransducerRecord.value);
      headerByteArray = Buffer.alloc(headerSize); // Buffer is also Uint8Array - https://nodejs.org/api/buffer.html#buffer_buffers_and_typedarrays

      console.log("offsetToFirstTransducerRecord.value: " + headerSize);

      headerByteArray[0] = 0x11;
      headerByteArray[1] = 0x22;
      headerByteArray[headerSize-1] = 0xFF;


    } catch (e) {
      console.log("WARNING: Allowing continuance of capture, however something went wrong in initializeFileWritingData in capture-data.js: " + e);
    }

  } // End of: initializeFileWritingData






  var createCaptureWriteStreamFilePath = function () {

    // padStart is included in ECMAScript 2017
    // for very high file counter values, >9999, this should just expand
    var currentCaptureWriteStreamFileName = FN_PREFIX + '' + fileCounter.toString().padStart(FN_PAD_NZEROES, '0') + FN_SUFFIX;
    activeFilePath = path.join(directory.toString(), currentCaptureWriteStreamFileName);

  } // End of: createCaptureWriteStreamFilePath






  var startNewFile = function () {

    // Create filename and open the path
    fileCounter = fileCounter + 1;      // start from 1, init'd at 0
    createCaptureWriteStreamFilePath();

    // Initialize file write stream
    captureWriteStream = fs.createWriteStream(activeFilePath);
    captureWriteStream.setDefaultEncoding('hex');

    // Write header data to file
    console.log("startNewFile: headerByteArray length: " + headerByteArray.length);
    captureWriteStream.write(headerByteArray);

  } // End of: startNewFile









  var writeDataToFile = function ( buf ) {

    captureWriteStream.write(buf, err => {
      if ( err ) {
        console.error("capture-data.js: writeDataToFile: error: " + err);
        // TODO set readyToCapture to false?
        // TODO when would that value otherwise be checked?  Only here?
      }
    });

  } // End of: writeDataToFile









  this.ReceiveData = function ( newData ) {

    if ( fileCounter < 1 || waveformCounter > waveformsPerFile ) {
      startNewFile();
    }

    //inDataBuffer = new Buffer.concat([inDataBuffer, newData]);

    // TODO chunk it out / rotate
    writeDataToFile(newData);

  } // End of: ReceiveData





} // End of: function CaptureDataFileOutput




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
      });
    }); // end of new Promise
  } // End of: loadCustomCaptureOptionsPromise




module.exports = CaptureDataFileOutput;
