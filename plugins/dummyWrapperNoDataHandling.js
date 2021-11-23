//
// dummyWrapperNoDataHandling.js
//
//
// Plugin wrappers should include the minimum as in this file
// 
// Included just to force creation of the unpacked plugins directory during bundling

const path  = require('path');
const fs    = require('fs');

//process.env.CORECLR_DIR='/usr/local/share/dotnet/shared/Microsoft.NETCore.App';
//process.env.CORECLR_DIR='/usr/local/share/dotnet/sdk';
//process.env.CORE_VERSION=
//process.env.EDGE_USE_CORECLR=0;
//process.env.EDGE_APP_ROOT = path.join(__dirname);
//console.log(process.env.EDGE_APP_ROOT);
//console.log(process.env);
//var edge = require(path.join(electron.remote.app.getAppPath(), 'node_modules', 'electron-edge-js')); // Not used here but to force electron-packaker to bundle the package / or unpacked doesn't properly see the node_modules directory unless TODO maybe be a separate nested package.json would to do it?
var edge = require('electron-edge-js');
//console.log(edge);

const pluginName = "DummyWrapperNoDataHandling";

class Plugin {
    constructor ({
        // Place holder 
    } = {}) {

        this.ev = null;

        this.Ident = function() {
            return pluginName;
        }

        this.SetEv = function(em) {
            this.ev = em;

            // For this dummyWrapper - no data response
            // this.ev.on("dataSetReady", function(data) {
            //     console.log(__filename, `${pluginName} received dataSetReady event`);
            //     //console.log(data);
        
            //     // If not using the test array length function here, and rather handling 
            //     // a data set as defined for the rawWaveformProcessing, data is:
            //     // { data.chan, data.wf }
            //     // TODO below is left over from prior to class ing this
            //     // theMainEdgeFunction( data.wf, function(error, result) {
            //     //     console.log(`theMainEdgeFunction res: ${result}`);
            //     // });
            // });
        
            // This plugin subscribes to the rawWaveformProcessing data available event
            this.ev.on('initRawWaveformProcessing', function(data) {
                // In addition to the constructor, in the wrapper class, add an init function
                // The wrapper itself encapsulates the knowledge of what processingOptionsFile to use
                console.log(`${pluginName}: numChannels: ${data.numChannels}`);
                console.log(`${pluginName}: returnDataElementBaseName: ${data.returnDataElementBaseName}`);
            });
        
        }

    } // end of constructor

} // end of class Plugin

//var ev; // why am i blanking on a better way to do this?


// var ident = function() {
//     return pluginName;
// }

// var sayHello = function(toWhoseLittleFriend) {
//     return `Al Pacino: Say Hello to My Little Friend, ${toWhoseLittleFriend}`;
// }

// Main place to subscribe to events and implement the corresponding action as needed by your plugin
// var setEv = function(em) {

//     ev = em;
//     ev.on("dataSetReady", function(data) {
//       console.log(__filename, `${pluginName} received dataSetReady event`);
//       console.log(`chan: ${data.chan} wf.length: ${data.wf.length}`);
//     });

//     // This plugin subscribes to the rawWaveformProcessing data available event
//     ev.on('initRawWaveformProcessing', function(data) {
//         // In addition to the constructor, in the wrapper class, add an init function
//         // The wrapper itself encapsulates the knowledge of what processingOptionsFile to use
//         console.log(`${pluginName}: numChannels: ${data.numChannels}`);
//         console.log(`${pluginName}: returnDataElementBaseName: ${data.returnDataElementBaseName}`);
//         // Lastly: processingOptionsFile
//     });
// }


module.exports = {
    //   sayHello
    // , ident
    // , setEv
    Plugin
};