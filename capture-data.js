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

const EventEmitter = require('events');
class Emitter extends EventEmitter {};
var CaptDataEmitter = new Emitter();

const fs = require('fs');
const path = require('path');
const strftime = require('strftime');
const csv = require('csv');           // some issues with just csv-parse so using the whole csv package
//const parse = require('csv-parse/lib/parse');

const wfparse = require('./waveform-parsing-hdl-010n-RSnnn.js');

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

  - https://stackoverflow.com/questions/31413749/node-js-promise-all-and-foreach


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
    numberOfWaveformsPerFile = 600,
    numberOfSamplesPerWaveform = 4095,      // Default HDL-0108-nnnnn WF return length at the time of writing this
    numberOfBytesPerSample = 1,             // Same comment as above
    waveformSampleFrequencyHz = 40000000,    // Default HDL-0108/4-nnnnn WF is 40MHz
    structureIdInfoInputEle = null,
    plugins = null

  } = {}) {

    // constructor body ... it's most of this code ...

    this.directory = directory;
    this.numberOfWaveformsPerFile = numberOfWaveformsPerFile;



    // Hardware-specific - could be moved to a parent / separate level
    // hardware configuration module
    //
    // This is interesting:
    // Specifically for our current hardware and methodology,
    // One byte is one sample
    // Output bytes however may be different if values are scaled
    // and then converted into a custom legacy output file
    // format which might actually be a 4-byte float value per each sample
    // Even legacy legacy very early standard format was I believe only 12-bit
    this.numberOfBytesPerSample = numberOfBytesPerSample;
    this.numberOfSamplesPerWaveform = numberOfSamplesPerWaveform;
    this.waveformSampleFrequencyHz = waveformSampleFrequencyHz;
    // Can add data for scaling samples to real values
    // End of hardware-specific

    console.log("CaptureDataFileOutput instantiated with output directory: " + this.directory + " and file splits at " + this.numberOfWaveformsPerFile + " waveforms.");

    this.prefs = null;
    this.customCaptureOptionsJson = null;
    this.readyToCapture = false;

    this.plugins = plugins;
    //console.log(JSON.stringify(plugins));

    this.fileCounter = 0;
    this.currentSeriesIndex = null;
    this.waveformCounter = 0;
    this.waveformsPerFile = 0;
    this.scansPerFile = 0;
    this.scanCounter = 0;
    this.minChannelNum = 0;
    this.maxChannelNum = 0;
    this.completedCurrentFileScanCount = false;

    this.transducerCalibrationWaveformArray = null;
    this.transducerHeaderByteArray = null;
    this.headerByteArray = null;
    this.waveformRecordHeaderByteArrayTemplate = null;
    this.waveformRecordOutputByteArray = Buffer.alloc(0);

    this.fileCapturePrefix = null;
    this.fileCaptureExtWithDot = null;
    this.fileCaptureSeqNumDigits = null;
    this.fileCaptureMidFixPrefix = null;
    this.fileCaptureMidFixSeqNumDigits = null;
    this.fileCaptureMidFixSuffix = null;

    this.captureFileOutputBytesPerWaveformSample = null;
    this.timestampFormat = null;
    this.excludeStartOfFrameFromOutput = null;
    this.numberOfWaveformsPerScanForHardwareMode = null;

    this.activeFilePath = null;
    this.activeWriteStream = null;
    this.duplicateFileNamingMidFix = null;              // MidFix = after the prefix, indicating a series number, but before the file sequence number
    this.duplicateMidFixSeriesNum = 0;
    this.captureWriteStream = null;

    // We'll reuse the initialized write file header byte array
    // but we need to update just a few things at each new file creation
    // subsequent to the first batch waveform file creation
    // In the transducer header section, nothing will change
    // In the waveform record headers
    // The channel number will change in the waveform record headers either
    this.bytePosnRunId = null;
    this.bytePosnTimestamp = null;
    this.bytePosnWaveformRecordScanNumber = null;
    this.bytePosnWaveformRecordChannelNumber = null;

    this.inDataBuffer = Buffer.alloc(0);

    this.lengthOfSof = wfparse.lengthOfSof;


    this.NumberOfChannels = () => {
      return this.maxChannelNum;
    }

    //
    // <PLUGINS>
    // Plugin Initialization here for data processing plugins in this mode 

    CaptDataEmitter.once('captureDataNumberOfChannelsSet', (dataIsNumChans) => {  // emitted on initializeFileWritingTransducerData
      console.log("Num Channels Set (Event Rcvd). Pushing init to plugins: " + dataIsNumChans);
      plugins.pluginPushInit({
        msgType: "initRawWaveformProcessing",
        numChannels: dataIsNumChans,
        returnDataElementBaseName: 'chartThickness'
      });
     });

    // </PLUGINS>
    //
    //




    // TODO BIG FOR RELEASE
    // (1)  move the third-party custom user code and
    //      file structure data to a git ignored folder
    //      and remove from the git tree
    // (2) We really need to note about issues and non-benefits of using the
    //     legacy file output format




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




  this.parseStructureIdInfo = (inputEle) => {

    if ( !inputEle ) {
      return null;
    }

    try {

      if ( $.trim(inputEle.val()) ) {
        // Yeah, so let's say one literally types in:
        // #{a} 99 ' by 77" #3 @West \right \r\n
        // then inputEle.val() will return in a string on the console
        // in debugger at least:
        // "#{a} 99 ' by 77" #3 @West \right \r\n"
        var t = $.trim(inputEle.val());
        // and should be fine to write any of that to file because
        // just the ascii chars are stored apparently
        // and it shouldn't be possible to enter control chars into the
        // text input (?)
        // So just trim beginning and ending spaces
        // Truncation or padding is handled in the header prep code
        // for example, search this code file for "TankId"
        return t;
      } else {
        return null;
      }

    } catch (e) {
      console.error("Error capture-data parse Structure Id Info: ");
      console.error(e);
      return null;
    }

  }




  // Constructed inits are not hoisted ...come after the function declaration
  this.structureIdInfo = this.parseStructureIdInfo(structureIdInfoInputEle);






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
            this.initializeFileWritingData( this.customCaptureOptionsJson ); // includes building the calibration waveform headers and records
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

      json = this.customCaptureOptionsJson.additionalFileInfo;

      this.captureFileOutputBytesPerWaveformSample = parseInt(json.captureFileOutputBytesPerWaveformSample.lengthBytes);
      this.timestampFormat = json.timestampFormat;
      this.excludeStartOfFrameFromOutput = json.excludeStartOfFrameFromOutput;

      json = this.customCaptureOptionsJson.transducersInfo;
      this.numberOfWaveformsPerScanForHardwareMode = parseInt(json.numberOfScannedChannels.value);

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

    }); // end of new Promise

  } // End of: checkOutputDirectory








  this.initializeFileWritingWaveformRecordHeader = ( optionsJson ) => {

      return new Promise ( (resolve, reject) => {

        try {

          this.waveformRecordHeaderByteArrayTemplate = Buffer.alloc(
            parseInt(optionsJson.additionalFileInfo.waveformRecordHeader.baseHeaderLen)
          );

          console.log(`initializeFileWritingWaveformRecordHeader...`);

          let posn = 0;
          let json = optionsJson.additionalFileInfo.waveformRecordHeader;

          // Total record size including wf in bytes
          // Int32
          let wfrl = this.getCurrentCaptureOutputFileWaveformRecordLengthBytes();
          //console.log(wfrl);
          this.int32JsonValToByteArray(wfrl).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 4;

          // Waveform number
          // Int16
          // REPLACED for each waveform write to file
          // Looking at sample file, this value increments (and thus it's name
          // changed to "ScanNumber") only after transducer's waveform is packaged
          // Thus each set of transducer channels has the same scan number
          // Legacy-named WaveformNumber ...
          // Update this each scan (or repeat of channel cycle)
          this.bytePosnWaveformRecordScanNumber = posn;
          //console.log(posn);
          // this.waveformCounter is actually wrong here but it doesn't matter
          // as the value gets updated ... putting scan Counter not waveformCounter just for readability
          this.int16JsonValToByteArray(this.scanCounter).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 2;

          // Transducer number - yes, base 1
          // Int16
          // REPLACED with each waveform
          this.bytePosnWaveformRecordChannelNumber = posn; // TODO fix from posn counter in fleshed out fcn here
          // TODO - code to update this each waveform
          //console.log(posn);
          this.int16JsonValToByteArray(this.minChannelNum).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 2;


          // Number of waveform points (not bytes)
          // Int32 - was nominally 2500 default, now we use our default or passed in value
          // Adjust this for whether or not we output the SOF
          //console.log(posn);
          this.int32JsonValToByteArray(this.getNumberOfOutputSamplesPerWaveform()).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 4;


          // Timbase (we use our updated method on this just like for cal files)
          // Float32 (4-Byte) in seconds (eg from sample file at 25MHz was 77CC 2B33 => 4e-08 = 40 ns)
          // from capt options
          // This is hardware dependent also, so it should be part of the hardware
          // options set in the instance
          // TODO place in hardware descriptor module
          var tb = parseFloat(1.0/parseFloat(this.waveformSampleFrequencyHz));
          //console.log(posn);
          this.float32JsonValToByteArray(tb).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 4;


          // Array descriptor rank: first dimension - legacy - always 1?
          // Int16
          this.int16JsonValToByteArray(parseInt(json.legacyArrayDescriptorRank)).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          )
          //console.log(posn);
          posn = posn + 2;

          // Size of first array - is this 2500? legacy - yes eg 2500
          // Just another duplication of data - notably:
          // This is also number of points
          // Int32
          //console.log(posn);
          this.int32JsonValToByteArray(this.getNumberOfOutputSamplesPerWaveform()).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 4;

          // Lower bound index of this array length previously indicated - legacy - is this always 1?
          // Int32
          //console.log(posn);
          this.int32JsonValToByteArray(parseInt(json.legacyLowerBoundIndex)).copy(
            this.waveformRecordHeaderByteArrayTemplate, posn
          );
          posn = posn + 4;

          //console.log(`waveform record header length as last posn value ${posn}`);

          // End header
          // Note: In a complete record, the wf data would be next

          resolve(true);

        } catch ( e ) {
          console.warn(`Error in initializeFileWritingWaveformRecordHeader: ${e}`);
          resolve(false);
        };

      }); // end of new Promise

  } // End of: initializeFileWritingWaveformRecordHeader










  this.getNumberOfOutputSamplesPerWaveform = () => {

    var numOutputSamplesPerWaveform = this.excludeStartOfFrameFromOutput ?
      this.numberOfSamplesPerWaveform - this.lengthOfSof :
      this.numberOfSamplesPerWaveform;

    return numOutputSamplesPerWaveform;

  }








  // we should probably rework this to a promise ... for sequential build before indicate a successful construction and load event
  this.initializeFileWritingData = ( optionsJson ) => {


    try {

      this.initializeFileWritingWaveformRecordHeader( optionsJson )
        .then( res => {
          // initializeFileWritingTransducerData
          // returns a promise and should be chained as subsequent calls
          // do depend on its successful completion
          this.initializeFileWritingTransducerData( optionsJson )
          return;
        })
        .then( res => {

          // Now the main file header initialization

          // Could add if (res) here if we want to proceed IFF
          // the previous fcn call returns true

          // Some silliness in legacy compat here
          // Below, nominally comes to 600 waveforms per file
          // And, divided by the number of transducers in use for capture
          // output, it should be sensibly some integer number of scans
          this.waveformsPerFile = parseInt(optionsJson.headerData.transducersNum.value)
                           * parseFloat(optionsJson.additionalFileInfo.readingsPerInch.value)
                           * parseFloat(optionsJson.headerData.runLengthInches.value);
          console.log("waveformsPerFile calculated from options to be: " + this.waveformsPerFile);

          // See comment above for this.waveformsPerFile
          this.scansPerFile =
              parseFloat(optionsJson.additionalFileInfo.readingsPerInch.value)
              * parseFloat(optionsJson.headerData.runLengthInches.value);
          console.log(`scansPerFile calculated from options to be: ${this.scansPerFile}`);
          if ( !Number.isInteger(this.scansPerFile) ) {
            let spf = parseInt(this.scansPerFile);
            console.warn(`Warning: initializeFileWritingData: this.scansPerFile was calculated to be: ${this.scansPerFile}, but this is not an integer.  Thus there will not be the same number of waveforms for each channel.  Thus rounding the number of scansPerFile down to: ${spf}`);
            this.scansPerFile = spf;
          }


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

          // RunId
          // TODO UPDATE IN HEADER on each file creation
          this.bytePosnRunId = posn;
          posn = this.int16JsonValIntoHeaderArray(
            optionsJson.headerData.runId.value,
            posn
          );

          // TODO - get the actual Tank ID at construction or init
          // We'll use a json object passed in for extra stuff like
          // this
          // Tank Id Information
          len = parseInt(optionsJson.headerData.tankId.lengthBytes);
          let ti = this.structureIdInfo ? this.structureIdInfo : optionsJson.headerData.tankId.value.toString();
          x = Buffer.from(
            ti
              .substr(0, len).padEnd(len, ' ') // pad with space char
          );
          x.copy(this.headerByteArray, posn);
          posn = posn + x.length;

          // datetimestamp length write
          // Length of datatimestamp
          posn = this.int16JsonValIntoHeaderArray(
            optionsJson.headerData.timestamp.lengthBytes,
            posn
          );

          // UPDATE IN HEADER on each file creation
          // datetimestamp itself
          // Timestamp
          //var d = strftime('%d/%m/%Y %H:%M:%S', new Date());
          var d = new Date();
          console.log(`initial main header construction timestamp: ${d}`);
          var d = strftime(this.timestampFormat, d);
          //len = parseInt(optionsJson.headerData.timestamp.lengthBytes)
          //re: commented above: the format determines the length,
          // and this is the same as the length from the file
          x = Buffer.from(d); //.substr(0, len)); // commented last part: see above comment
          x.copy(this.headerByteArray, posn);
          this.bytePosnTimestamp = posn;
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

          // This should be updated with actual lengths of XD records (cal files etc)
          // offsetToFirstCaptureWaveformBaseOne
          // For example, in the legacy output sample file
          // The value is 5861 decimal and the first byte of the waveform records
          // starts at byte # 5860 starting from byte 0
          // So, it is a base 1 number counting type
          // In our first testing, the code below generates a value of:
          // 1513 decimal and the waveforms thus begin at byte number
          // 1512 starting from byte 0
          // LEGACY WEIRD: So this is a legacy compatibility thing
          // NOTE: This is an offset to start, not a length, hence the addition
          // of the headerSize, which is really the offset to the start of the
          // transducers section
          var o = 1 + headerSize + this.getCurrentCaptureFileTransducersSectionHeaderLength();
          posn = this.int32JsonValIntoHeaderArray(
            //optionsJson.headerData.offsetToFirstCaptureWaveformBaseOne.value,
            o,
            posn
          );

          // Nominally this can come from the capture options json file
          // if set up to match actual capture settings here
          // lengthOfWaveformRecord
          //console.warn(`Warning: the traditional waveform record length with header and data for 2500 points is: ${parseInt(optionsJson.headerData.lengthOfWaveformRecord.value)} and we are using the actual default hardware length now.`);
          // was: optionsJson.headerData.lengthOfWaveformRecord.value,
          // then was:
          //var wfRecLen = parseInt(optionsJson.additionalFileInfo.waveformRecordHeader.baseHeaderLen);
          //wfRecLen = wfRecLen + (this.numberOfBytesPerWaveform * 4); // 4 bytes per value for single/float
          var wfRecLen = this.getCurrentCaptureOutputFileWaveformRecordLengthBytes();
          console.warn(`Warning: the traditional waveform record length with header and data for 2500 points is: ${parseInt(optionsJson.headerData.lengthOfWaveformRecord.value)} and we are using the actual default hardware length now which brings this to ${wfRecLen} bytes, probably because the waveforms sample longer and at higher sample rate.`);
          posn = this.int32JsonValIntoHeaderArray(
            wfRecLen,
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

          return; // Will an empty return allow for sync handling of this then?

        }); // end of first then  // TODO move that stuff to a sep fcn!?

    } catch (e) {
      console.warn("WARNING: Allowing continuance of capture, however something "
        + " went wrong in initializeFileWritingData in capture-data.js: " + e);
    }

  } // End of: initializeFileWritingData









  this.initializeFileWritingTransducerData = ( optionsJson ) => {

    return new Promise( (resolve, reject) => {

      try {

        // The transducer header, information, and waveform will always
        // be the same for every batch output file

        this.minChannelNum = 1;
        this.maxChannelNum = parseInt(optionsJson.headerData.transducersNum.value);
        CaptDataEmitter.emit('captureDataNumberOfChannelsSet', this.maxChannelNum);

        //var headerSize = parseInt(optionsJson.additionalFileInfo.offsetToFirstTransducerRecord.value);
        // TODO -- IMPORTANT -- this next value is calculated from the XD
        // section total length and should be written correctly
        // back into the main header as well as used correctly here
        //var offsetToFirstCaptureWaveformBaseOne =
        //  parseInt(optionsJson.headerData.offsetToFirstCaptureWaveformBaseOne.value);
        // parseInt should be 32-bit anyway

        //var lenXdByteArr = offsetToFirstCaptureWaveformBaseOne - headerSize;
        // eg 5860 - 1024 = 4836

        // Actual length should be computed from cal file lengths and data
        // [0 .. 39] XD header info - always the same
        // [40 .. 4xCalWaveLengthInPoints-1] because all values are "single" = 4-byte float
        //this.transducerByteArray = Buffer.alloc(lenXdByteArr);
        //console.log("transducer data section byte length is: " + lenXdByteArr);

        // start index = headerSize => eg 1024
        // stop index = headerSize + lenXdByteArr - 1
        //            = 1024 + 4836 = 5860 - 1 = 5859 => yes this matches sample file
        //            ie transducer data ends at byte 5859 such that 5860 byte index = first byte of waveform record

        // For each transducer there is a constant-length header
        var len = parseInt(optionsJson.transducersInfo.header.lengthBytes);

        console.log("each xdHeader base buffer len set to: " + len + " bytes");

        // Get and order the transducer serial numbers array from json
        const xdSnLen = parseInt(optionsJson.transducersInfo.serialNumbersInfo.lengthBytes);
        const xdSnJson = optionsJson.transducersInfo.serialNumbers;
        var xdSnArr = [];

        // TODO abstract the ordering functionality
        var ordered = {};
        Object.keys(xdSnJson).sort().forEach(function(key) {
          ordered[key] = xdSnJson[key];
        });
        for ( var key in ordered ) {
          xdSnArr.push(ordered[key]);
        };

        var totalCaptureFileXdSectionHeaderLenBytes =
          this.getCurrentCaptureFileTransducersSectionHeaderLength();

        this.transducerHeaderByteArray = Buffer.alloc(0);

        var xdn = 0;
        for ( xdn = parseInt(this.minChannelNum); xdn < parseInt(this.maxChannelNum) + 1; xdn++) {

          console.log(`building header data for transducer # ${xdn}`);

          var xdHeader = Buffer.alloc(len);
          var wfl = this.transducerCalibrationWaveformArray[xdn - 1];
          wfl = wfl ? wfl.length : 0;
          var totalXdRecordLen = xdHeader.length + (wfl * 4); // Yes, here in this header, this is the number of byte = 4 * values
          console.log(`total transducer # ${xdn} record length is ${totalXdRecordLen}`);

          var posn = 0;
          var x;

          this.int32JsonValToByteArray(totalXdRecordLen).copy(xdHeader, posn);
          posn = posn + 4;

          this.int16JsonValToByteArray(xdn).copy(xdHeader, posn);
          posn = posn + 2;

          // Transducer serial number
          // Next: that does add the ASCII "0" char which is no good
          //new Buffer.from(xdSnArr[xdn - 1].toString().padEnd(xdSnLen, 0x00))
          //  .copy(xdHeader, posn);
          var tsn = Buffer.alloc(xdSnLen, 0x00);
          var asn = Buffer.from(xdSnArr[xdn-1].toString());
          asn.copy(tsn, 0, 0, tsn.length);
          tsn.copy(xdHeader, posn);
          posn = posn + xdSnLen;

          // Transducer calibration file waveform point count (not bytes)
          this.int32JsonValToByteArray(wfl).copy(xdHeader, posn);
          posn = posn + 4;

          // Timebase = period as a 4-byte float in actual seconds (like 4e-08 = 25MHz)
          // This value comes from the calibration file previously
          // However, we'll share the warning to console if it exists
          // The point: there are various naming conventions and implementations of
          // this that differ across the codebase differing in whether they mean
          // MHz or Hz or seconds for the period.
          // So we just implement this in the capture options file for now.
          // Further, such cal file usage might not be used much anymore.
          // For simplicity it is now called sampleFrequencyHz
          // The legacy transducer header file however uses seconds,
          // as noted at the top of this comment.
          var cwf = optionsJson.transducersInfo.calWaveFilesInfo.sampleFrequencyHz;
          var cwsrtbs = 1.0 / parseFloat(cwf); // Convert freq to timebase in seconds
          this.float32JsonValToByteArray(cwsrtbs).copy(xdHeader, posn);
          posn = posn + 4;

          // VB6 legacy array rank indicator (first dimension index I think)
          // Always 1
          this.int16JsonValToByteArray(1).copy(xdHeader, posn);
          posn = posn + 2;

          // VB6 legacy array 2nd dimension indicator of length
          // as in point size, this is the same as the above value for point count
          // in practice ... legacy compat ...
          this.int32JsonValToByteArray(wfl).copy(xdHeader, posn);
          posn = posn + 4;

          // VB6 legacy array 2nd dimension first index number
          // legacy compat ...
          // Should always be 1 also
          this.int32JsonValToByteArray(1).copy(xdHeader, posn);
          posn = posn + 4;

          // Double check that our length matches the standard header length:
          if ( posn != len ) {
            console.warn("Warning: capture-data.js: initializeFileWritingTransducerData: "
              + "after inserting all transducer header data, the xd header length "
              + len + " does not "
              + "match the last byte position (posn): " + posn);
          }

          // Now we build up this 40-byte header and the add the suffix
          // of the waveform as 4-byte single/floats
          var i;
          var wfAsByteBuf = Buffer.alloc(wfl * 4);
          posn = 0;
          for ( i = 0; i < wfl; i++ ) {
            var x = this.float32JsonValToByteArray(
              this.transducerCalibrationWaveformArray[xdn - 1][i]
            );
            x.copy(wfAsByteBuf, posn);
            posn = posn + 4;
          }


          this.transducerHeaderByteArray = Buffer.concat(
            [this.transducerHeaderByteArray, xdHeader, wfAsByteBuf]);

        } // end of for each xdn number

        if ( this.transducerHeaderByteArray.length != totalCaptureFileXdSectionHeaderLenBytes ) {
          console.warn(
              "Warning: capture-data.js: initializeFileWritingTransducerData: "
            + "this.transducerHeaderByteArray.length, " + this.transducerHeaderByteArray + ", "
            + "does not equal the result of getCurrentCaptureFileTransducersSectionHeaderLength, "
            + " " + totalCaptureFileXdSectionHeaderLenBytes);
        }

        resolve(true);

      } catch ( e ) {
        console.error("capture-data.js: initializeFileWritingTransducerData: error: " + e + " resolving false.");
        resolve(false); // for now, let's not crash a whole chain
      }

    }); // end of new Promise

  } // End of: initializeFileWritingTransducerData










  this.updateWaveformRecordHeader = ( scanNumber, transducerNumber ) => {

    return new Promise ( (resolve, reject) => {

      try {

        let buf = Buffer.from(this.waveformRecordHeaderByteArrayTemplate);

        this.int16JsonValToByteArray(scanNumber).copy(
          buf, //this.waveformRecordHeaderByteArrayTemplate,
          this.bytePosnWaveformRecordScanNumber
        );

        this.int16JsonValToByteArray(transducerNumber).copy(
          buf, //this.waveformRecordHeaderByteArrayTemplate,
          this.bytePosnWaveformRecordChannelNumber
        );

        //console.log(buf);
        //console.log(`updated waveformRecordHeaderByteArrayTemplate with scan number, xdNumber: ${scanNumber} ${transducerNumber}`);

        resolve(buf);

      } catch (e) {

        console.warn(`warning: capture-data.js: updateWaveformRecordHeader: e: ${e}`);
        resolve(false);

      }

    }); // end of new Promise

  } // End of: updateWaveformRecordHeader










  this.updateCaptureBatchFileOutputHeader = ( runId, timestampUnformattedFromNewDate ) => {

    // There is no header param anywhere for actual number of waveforms in a file
    // So, no need to handle partial captures

    return new Promise ( (resolve, reject) => {

      try {

        //console.log(`called updateCaptureBatchFileOutputHeader with: runId: ${runId} and ts: ${timestampUnformattedFromNewDate}`);

        //console.log("before header update:");
        //console.log(this.headerByteArray);

        this.int16JsonValIntoHeaderArray(
          runId, this.bytePosnRunId
        );

        new Buffer.from(
          strftime (
            this.timestampFormat,
            timestampUnformattedFromNewDate
          )
        ).copy(
          this.headerByteArray,
          this.bytePosnTimestamp
        );

        //console.log("after header update:");
        //console.log(this.headerByteArray);

        resolve(true);

      } catch ( e ) {
        console.warn("updateCaptureBatchFileOutputHeader: e: " + e);
        resolve(false);
      };

    }); // end of new Promise

  } // End of: updateWaveformRecordHeader










  this.getCurrentCaptureFileTransducersSectionHeaderLength = () => {

    // ASSUMES the instance json has been populated from file first

    var optionsJson = this.customCaptureOptionsJson;
    var nxd = parseInt(optionsJson.headerData.transducersNum.value);
    var baseHeaderLen = parseInt(optionsJson.transducersInfo.header.lengthBytes);
    var lenBytes = 0;
    lenBytes = nxd * baseHeaderLen;
    for ( var i = 0; i < nxd; i++ ) {                       // old school
      let a = this.transducerCalibrationWaveformArray[i];
      if ( a ) {                                            // will be "false" or an array
        lenBytes = lenBytes + a.length * 4;                 // 4 bytes per value as a single/float
      }
    }

    console.log(`getCurrentCaptureFileTransducersSectionHeaderLength: ${lenBytes} bytes.`);
    return lenBytes;

  } // End of: getCurrentCaptureFileTransducersSectionHeaderLength









  this.getCurrentCaptureOutputFileWaveformRecordLengthBytes = () => {

    let json = this.customCaptureOptionsJson.additionalFileInfo.waveformRecordHeader;
    let hbl = parseInt(json.baseHeaderLen);
    let nspwf = this.numberOfSamplesPerWaveform;

    // The output file for capture get the base header length in bytes
    // plus the number of samples multiplied by the number of bytes
    // in the OUTPUT sample format, optionally with or without the start of frame
    let outputSamples = this.excludeStartOfFrameFromOutput ? nspwf - this.lengthOfSof : nspwf;
    hbl = (outputSamples
      * this.captureFileOutputBytesPerWaveformSample) + hbl;

    return hbl;

  } // End of: getCurrentCaptureOutputFileWaveformRecordLengthBytes










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

    //console.log("int16JsonValIntoHeaderArray posn exit value: " + posn);

    return posn;

  } // End of: int16JsonValIntoArray








  this.int16JsonValToByteArray = ( val ) => {

    var i16a = new Int16Array(1);
    i16a[0] = parseInt(val);
    var x = Buffer.from(i16a.buffer);
    return x;

  } // End of: int16JsonValToByteArray








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









  this.int32JsonValToByteArray = ( val ) => {

    var i32a = new Int32Array(1);
    i32a[0] = parseInt(val);
    var x = Buffer.from(i32a.buffer);
    return x;

  } // End of: int32JsonValToByteArray









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








  this.float32JsonValToByteArray = ( val ) => {

    var f32a = new Float32Array(1);
    f32a[0] = parseFloat(val);
    var x = Buffer.from(f32a.buffer);
    return x;

  } // End of: float32JsonValToByteArray










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
            //console.log(files);

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







  // Not yet used ...
  this.SetFileCaptureOutputDirectory = ( newDir ) => {
    this.directory = dir;
  } // End of: SetFileCaptureOutputDirectory








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

    // This is called (ideally?) from a receive data event.
    // Which means that, as long as the LoadCaptureOptions()
    // has been called after instantiation,
    // the capture batch output file header sections for:
    // - main header
    // - transducers section
    // - waveform record header (template)
    // have all been initialized and prepopulated as templates
    // Thus at each new file, we just need to update the changing
    // values in the headers and then write to file


    // We don't want to overwrite data
    // so ... here the file write flag is presented with "x" appended, as in,
    // don't overwrite if exists
    // And the error event is added.
    // We need also to check that the file does not exist and then
    // create/write -- or if it does, use the appropriate midFix addition
    // in the filepath creation routine

    return new Promise ( (resolve, reject) => {

      if ( this.fileCounter > 0 ) {
        // Then we already has a write stream open, so it is time to close it
        console.log(`Closing file stream: ${this.captureWriteStream.path}`)
        this.captureWriteStream.end();
        // Probably async - but the re-opening on a new fp should be fine
      }

      // Create filename and open the path
      this.fileCounter = this.fileCounter + 1;      // start from 1, init'd at 0

      // Reset counters that start over within a file or are used to determine
      // when a new file is needed
      this.scanCounter = 0;
      this.waveformCounter = 0; // TODO is this still used?
      this.completedCurrentFileScanCount = false;
      // TODO what else needs to get reset?

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
            // EMIT Notification to any subscribers
            CaptDataEmitter.emit('captureDataNewFile', { "fp": this.activeFilePath, "fn": this.fileCounter } );
            this.captureWriteStream.setDefaultEncoding('hex');
            this.captureWriteStream.on('error', function(e) {
              console.error("capture-data.js: captureWriteStream error event: " + e);
              this.readyToCapture = false;
            });

            // Update the main header with current data where needed
            // Waveform record header should be updated before each waveform
            // record write since the channel number gets updated in addition
            // to the scan number (which changes only after every set of channels scanned)
            //console.log("startNewFile: update main record header with changeable values.");
            this.updateCaptureBatchFileOutputHeader(
              this.fileCounter,   // RunId
              new Date()          // Unformatted time stamp
            )
            .then ( res => {

              // Since the write stream is the same, these should
              // execute sync

              // Write header data to file
              //console.log("startNewFile: headerByteArray length: " + this.headerByteArray.length);
              //console.log(this.headerByteArray);
              this.captureWriteStream.write(this.headerByteArray);

              // Write transducer header data to file
              // Nothing to update here - it is always the same
              // for the whole series of batch capture files
              //console.log("startNewFile: this.transducerHeaderByteArray length: " + this.transducerHeaderByteArray.length);
              this.captureWriteStream.write(this.transducerHeaderByteArray);

              resolve(true);
            });

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

      } else {
        //console.log(`writeDataToFile: received this number of bytes to write: ${buf.length}`);
      }
    });

  } // End of: writeDataToFile









  this.ReceiveData = ( newData ) => {

    if ( !this.readyToCapture ) {
      console.warn("capture-data.js: this.ReceiveData: Warning: readyToCapture is false." );
    }

    //console.log(`this.bytePosnWaveformRecordScanNumber: ${this.bytePosnWaveformRecordScanNumber}`);
    //console.log(`this.bytePosnWaveformRecordChannelNumber: ${this.bytePosnWaveformRecordChannelNumber}`);

    // First process any data to waveforms formatted for writing to file
    this.inDataBuffer = Buffer.concat([this.inDataBuffer, newData]); // accumulate
    //this.parseInBufferForWaveforms();

    if (
      this.fileCounter < 1
      //|| this.waveformCounter > this.waveformsPerFile
      //|| this.scanCounter > this.scansPerFile
      || this.completedCurrentFileScanCount == true
    ) {

      // Yes, we should .then write any waveforms found
      // to file after start new file to keep
      // order of write to file

      this.startNewFile()
        .then ( res => {
          if ( res ) {
            return this.parseInBufferForWaveforms();
          } else {
            console.warn("capture-data.js: ReceiveData: starting new file didn't work: can't write to anything." + res);
            return Promise.resolve(false);
          }
        })
        .then ( res => {
          if ( res ) {
            this.writeWaveformsToFile();
          }
          return;
        })
        .catch ( e => {
          console.warn("capture-data.js: ReceiveData: error: " + e);
        })

    } else {

      // yes we call it again here - it's in here twice
      // because it needs to be in sequence if creating new file
      // as above
      this.parseInBufferForWaveforms()
        .then( res => {
          return this.writeWaveformsToFile();
        });

    } // end of not needing to start a new file

  } // End of: ReceiveData













  this.parseInBufferForWaveforms = () => {

    return new Promise(( resolve, reject ) => {

      // TODO maybe always start a new file beginning from Channel 1
      // if the board is running in continuous capture mode already?

      // Any incoming data, unformatted for output
      // is in the inDataBuffer
      //console.log(this.inDataBuffer);
      var datInfos = wfparse.extractSofBoundsSets(
        this.inDataBuffer,
        this.scanCounter,
        this.scansPerFile
      );
      //console.log('datInfos are: ');
      //console.log(datInfos);
      /*
        datInfos = [{
        sof1: -1,             // Real indices start at 0
        sof2: -1,             // Real indices start at 0
        chan: 0               // Real numbers start at 1
        scan: N
      }, { next set etc }, { ... }];
      */
      if ( !datInfos || datInfos.length < 1 ) {
        console.log(`datInfos is nothing ...`);
        resolve(Buffer.alloc(0)); // was false
      } //else {

        // Update channel and scan number in header
        // Or instead of forEach use init large correct alloc and then
        // Promise.all for the di's with internal index tracking for correct offset
        // in output array
        //var diExecCounter = datInfos.length;

        // Using forEach mingles results with some async execution blocks
        // apparently that at this time I can't figure out how to promisify or sync
        // So
        // We will break this down into each with sep buffers as indep vars
        // and then combine in Promise.all
        var actions = datInfos.map ( di => {

          return new Promise ( (resolve, reject ) => {

            //console.log(di);
            //console.log(`di.scan: ${di.scan}, di.chan: ${di.chan}`);

            // Only start storing data after the first channel 1 is found
            // so as not to confuse legacy software addressed for customer in
            // this code.

            // Scan number inits at zero in this module and only increments to
            // 1 the first after channel 1 is found
            // If multiple channel 1's for example in a large buffer,
            // then there are just multiple increments of scan #
            // and if the first channel is chan 1 then scan # start out incremented
            if ( di.scan > 0 ) {

              // We only store channel data within the number of transducers
              // Higher number channels are discarded - for example
              // We could still be in a hardware channel scan mode capturing
              // all 8 channels but the legacy output requires max of 4 channels
              // Otherwise it will break / get confused.
              if ( di.chan < (this.maxChannelNum + 1) ) {

                this.updateWaveformRecordHeader(di.scan, di.chan)
                  .then( resultWaveformHeaderByteArray => {

                    //console.log(resultWaveformHeaderByteArray);

                    if ( resultWaveformHeaderByteArray ) {

                      let stop = di.sof2;
                      let start =this.excludeStartOfFrameFromOutput ?
                        di.sof1 + this.lengthOfSof :
                        di.sof1;
                      var outWfDat = Buffer.alloc(
                        (stop - start)
                        * this.captureFileOutputBytesPerWaveformSample
                      );
                      //console.log(`outWfdat length: ${outWfDat.length}`);

                      // Optionally, push the raw data buffer to the correct
                      // chart channel in the mainWindow
                      var chartOut = Buffer.alloc( (stop - start) );
                      this.inDataBuffer.copy(chartOut, 0, start, stop); // base 0, start at beginning of new buffer, start at start, stop is not inclusive
                      MainWindowUpdateChart( di.chan, chartOut );
                      //console.log(chartOut);

                      // <PLUGINS>
                      if ( plugins ) {
                        plugins.pluginPushDataSet({
                          chan: di.chan,
                          wf: chartOut
                        });
                      }
                      // </PLUGINS>

                      // TODO add warning if buffer length is longer than expected
                      // WF length - because in practice, we have seen that variability
                      // however slight can shift randomly the UART baud for example
                      // just enough that a few bits are lost thus creating spikes in
                      // data and interestingly creating 2nd byte of SOF issues
                      // That cause the missing of the parsed out SOF and thus a whole
                      // 8k sample buffer is clipped out and pushed to the chart
                      // Symptoms: you see an SOF spike at the end of the WF, if
                      // the SOF at the start is omitted from the WF pushed to the chart
                      // It turned out in this case to be a hardware different in about
                      // 4.5% vs 5.5% difference from target baud. CCC baud clocking
                      // has since been updated to get very close to the 2Mbps.
                      // However this is relevant in dev because on one board, baud clk
                      // was close enough that symbols just fit into the baud variability
                      // allowance creating constistently good data streams while on the
                      // other board, a very slight variation in the clock revealed the issue
                      // in the baud clock being generally too slow. The faster board,
                      // however slight in the difference, within clock tolerance on the
                      // board, masked the issue.

                      // Scale and place into waveform record formatted buffer
                      // for file output per capture output options and customization
                      // here, setup for custom-requested output demo
                      let scaled = 0.0;
                      let outIndex = 0;
                      let sofBuf = Buffer.alloc(0);
                      for ( let i = start; i < stop; i++ ) {
                        if ( this.excludeStartOfFrameFromOutput && i < this.lengthOfSof ) {
                          scaled = this.int32JsonValToByteArray(this.inDataBuffer[i]);
                          scaled.copy(outWfDat, outIndex);
                          outIndex = outIndex + 4;
                        } else {
                          scaled = wfparse.valToScaledFloat(this.inDataBuffer[i]);
                          outIndex = outWfDat.writeFloatLE(scaled, outIndex); // returns previous offset plus bytes written
                        }
                      }

                      var waveformRec = Buffer.concat([
                        resultWaveformHeaderByteArray,
                        outWfDat
                      ]);

                      //console.log(`about to resolve waveformRec with length: ${waveformRec.length}`);
                      resolve(waveformRec);

                    } else {
                      console.warn(`action for parse waveforms not: if(resultWaveformHeaderByteArray)`)
                      resolve(Buffer.alloc(0)); //(false); // null?
                    }

                  }); // end of then

                } else { // chan num > max num chans to store for legacy output

                  //console.log(`Skipping adding waveformRecord for chan: ${di.chan}`);
                  resolve(Buffer.alloc(0));

                }

              } else { // scan num < 1 - don't start collecting data yet

                //console.log(`Skipping adding waveformRecord for scan: ${di.scan}, chan: ${di.chan}`);
                resolve(Buffer.alloc(0)); // resolve as empty buffer such that concat works and just does nothing but doesn't break

              }

            }); // end of new Promise

        }); // end of actions

        var results = Promise.all(actions);

        results.then( data => {
          // TODO - update this.waveformCounter - and watch for max number
          // and then truncate - but see if we can keep data in the inDataBuffer
          // to roll forward without loss

          //console.log(data);
          //console.log('about to concat data');
          // data is an array of the Buffer results coming out of the action above
          // it could contain Buffer.alloc(0) for scans/chans ignored
          // All of that data will be sliced out below as old data in the input buffer
          // To prevent slicing at the end of a capture and retain input data to be
          // processed in a new file - that should be done in the
          // waveform parsing module such that the datInfos are never released
          // and thus the input data is never sliced out until it is processed in the
          // next file cycle
          var wfRecs = Buffer.concat(data);
          this.waveformRecordOutputByteArray = Buffer.concat([
            this.waveformRecordOutputByteArray,
            wfRecs
          ]);
          //console.log('concated data');
          // Remove the processed data from the beginning of the buffer
          // This also removes unused data as well like when chan 1 hasn't been
          // received yet at the beginning of a file
          // Might start with all scan 0's - not yet a buffer with a chan 1
          if ( datInfos && datInfos.length > 0) {
            this.inDataBuffer = this.inDataBuffer.slice(
              datInfos[datInfos.length - 1].sof2  // chop all beginning up to last SOF2 first byte, keeping that byte
            );
            // Store the last scan number that was counted
            //this.scanCounter = datInfos[datInfos.length - 1].scan;
            let scanCountNow = datInfos[datInfos.length - 1].scan;
            // Emit scan counter progress event if needed
            if ( scanCountNow != this.scanCounter ) {
              CaptDataEmitter.emit( 'captureDataProgress', (scanCountNow/this.scansPerFile * 100.0) );
            }
            this.scanCounter = scanCountNow;
            // TODO ROBUST
            // What if we somehow lose the last waveform and we are stuck
            // waiting for it and no data is going to file?
            if (
              this.scanCounter == this.scansPerFile
              &&
              datInfos[datInfos.length - 1].chan >= this.maxChannelNum
            ) {
              this.completedCurrentFileScanCount = true;
            }
          }

          resolve(true);
        })
        .catch( e => {
          console.warn(`warning: capture-data.js: parseInBufferForWaveforms: ${e}`);
          console.warn(e);
          resolve(false);
        });

      //} // end of else for when datInfo.length > 0 or is not !datInfos

    }); // end of new Promise

  } // End of: parseInBufferForWaveforms









  this.writeWaveformsToFile = () => {

    // TODO we could potentially just use pipes to simplify?

    if ( this.waveformRecordOutputByteArray.length > 0 ) {
      this.writeDataToFile(this.waveformRecordOutputByteArray);
      this.waveformRecordOutputByteArray = Buffer.alloc(0);
    }

  } // End of: writeWaveformsToFile







  this.SingleFileCaptureDurationMs = () => {

    let freq = parseFloat(wfparse.nominalWaveformReceiveFrequencyHz);

    let dur = 1.0/freq * this.numberOfWaveformsPerScanForHardwareMode * this.scansPerFile * 1000.0;

    return dur;

  } // End of: SingleFileCaptureDurationMs







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
          console.warn("capture-data.js: fileExists: Error on fs.stat: " + err
            + " this might be good if it intended to make sure that a write-to file "
            + "does not yet exist.");
          resolve(false);
        }
      });

    }); // end of new Promise

  } // End of: fileExists












// module.exports = CaptureDataFileOutput;
//module.export.CaptureDataFileOutput;
module.exports = {
  CaptureDataFileOutput,
  CaptDataEmitter
};
