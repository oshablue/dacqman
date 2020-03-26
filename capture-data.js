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



  this.LoadCaptureOptions = () => {

    readyToCapture = false;
    customCaptureOptionsJson = null;

    return new Promise ((resolve, reject) => {
      getPrefsPromise()
        .then(prefs => loadCustomCaptureOptionsPromise(prefs))
        .then( function(customCaptureOptionsJson) {
          if ( customCaptureOptionsJson ) {
            readyToCapture = true;
            console.log("capture-data.js: readyToCapture: " + readyToCapture);
            resolve(readyToCapture);
          } else {
            reject("Error loading prefs and customCaptureOptionsJson from file: customCaptureOptionsJson not set or is still null");
          }
        })
        .catch ( e => {
          console.log("Error loading prefs and customCaptureOptionsJson from file: " + e);
        })
    })

  }







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
