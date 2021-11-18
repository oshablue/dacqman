//
// stringLibraryWrapper.js (Edit with your file title here if desired)
//
//
// Plugin wrappers should include the minimum as in this file
// See also: README-Plugins.md


const path  = require('path');
const fs    = require('fs');



//
//
// ************************************************************************************
// <EDIT TO MATCH YOUR PLUGIN>
//

// May be required in the wrapper directly, or in the child process wrapper.
// If this is the only level of wrapper and wrapper uses .NET Core App 2.n 
// or similar (that is what is currently tested), include this here.
// If this wrapper calls a child wrapper (or child rapper) that actually implements 
// the edge-cs-wrapped dll, then this require is only needed in that file.
var edge = require('electron-edge-js');

// May be required in the wrapper if the wrapper calls a child process.
const { fork } = require('child_process');

const pluginName = "stringLibraryWrapper";      // Any name for identification on logs eg
const libName = "StringLibrary";                // Actuall filename without extension

// If any additional files needed, define here and implement the check that they are present
const optionsFilename = 'optionsFilename.js';
const optionsSubdir = 'user-data';

// If any additional child wrappers needed, define them, and maybe implement presence checking
const childWrapperFilename = 'childWrapper.js';

//
// </EDIT TO MATCH YOUR PLUGIN>
// ************************************************************************************
//
//



// Use path join and __dirname etc for auto-handling the plugins path in dev vs deploy
// and thus might be in project root (relative) or in asar / unpacked etc.
// __dirname uses the directory that this wrapper file lives in - so it will include the 
// plugins directory in its path
const libFileName = `${libName}.dll`;
const libPath = path.join(__dirname, libFileName);

// If there are extra files to load into this wrapper TODO don't know if this will work with bundled yet
const optionsPath = path.join(optionsSubdir, optionsFilename);
// TODO check on optionsPath too - existence in addition to path resolution in bundle

// Any child wrappers create path and optionally check for presence
const childWrapperPath = path.join(__dirname, childWrapperFilename);

// </EXAMPLE FOR HANDLING TESTING WHEN LIBRARY IS NOT PRESENT>
// This section retained for reference when plugin was not a class (until it "gits" out)
// Needed only for when this wrapper directly wraps a dll and that dll may or may not be present
// var theMainEdgeFunction
// var libPresent = false;
// if ( !fs.existsSync(libPath) ) {
//     console.log(`Not found: ${libPath} returning from wrapper load or an alt edge func may be in place.`);
//     //return false;
// } else {
//     libPresent = true;
// }
// if ( libPresent ) { 
//     theMainEdgeFunction = edge.func({
//         assemblyFile: libPath,
//         typeName: `${libName}.Test`,
//         methodName: 'CountLength'
//     });
//   } else {
//     theMainEdgeFunction = function(params) {
//       var res = {
//         Channel: params.ch,
//         Estimation: 0.5001,
//         Envelope: 1.0001
//       };
//       return res;
//     }
// }     
// </EXAMPLE FOR HANDLING TESTING WHEN LIBRARY IS NOT PRESENT>


// <EXAMPLES OF FUNCTION DEFS AND CALLS FROM INITIAL MS TUTORIAL FOR .NET CORE DLL + EDGE>
// var stringLibraryWrapper = edge.func({
//     assemblyFile: libPath,
//     typeName: `${libName}.Startup`//,
//     // methodName: 'StartsWithUpper' // Defaults to Invoke - which is the first test
// });
// var s = "test";
// stringLibraryWrapper( test, function ( error, result) {
//     console.log("test StartsWithUpper: ", result); // should false
// });
// var countLibWrap = edge.func({
//     assemblyFile: libPath,
//     typeName: `${libName}.Test`,
//     methodName: 'CountLength'
// });
// countLibWrap( Buffer.alloc(12, 0xC5, Uint8Array), function (error, result) {
//     console.log("test buffer length: ", result); // Should 12
// });
// </EXAMPLES OF FUNCTION DEFS AND CALLS FROM INITIAL MS TUTORIAL FOR .NET CORE DLL + EDGE>



class Plugin {
    constructor ({
        // Place holder - currently, DacqMan only calls empty constructors ie no params
    } = {}) {

        // Events - for all plugins
        this.ev = null;

        // Is the library present or should we just create a pretend function to be called
        this.libPresent = false;
        this.theMainEdgeFunction = null;


        // ***************************
        // <EDIT TO MATCH YOUR PLUGIN>
        //
        // Define other properties as implemented by your plugin, according to the 
        // init signatures implemented in DacqMan
        // 
        // (1) rawWaveformProcessing:
        this.numChannels = 1;
        this.returnDataElementBaseName = null;
        this.processingOptionsFile = null;          // Not implemented in this sample - for ref only
        //
        // </EDIT TO MATCH YOUR PLUGIN>
        // ****************************


        if ( !fs.existsSync(libPath) ) {
            console.log(`Not found: ${libPath} returning from wrapper load or an alt edge func may be in place.`);
            //return false; // Uncomment if you just want this to exit - that behavior needs completed handling elsewhere
        } else {
            this.libPresent = true;
        }


        // ***************************
        // <EDIT TO MATCH YOUR PLUGIN>
        // edit the edge.func parameters, but keep this.theMainEdgeFunction if using it
        //
        if ( this.libPresent ) { 
            // The real wrapped function
            // This example uses the stringLibrary.dll function just to test/demo 
            // the added class in there that does array CountLength
            this.theMainEdgeFunction = () => edge.func({
                assemblyFile: libPath,
                typeName: `${libName}.Test`,
                methodName: 'CountLength'
            });
        } else {
            // Just an example of defining it alternately for testing?
            this.theMainEdgeFunction = (params) => {
              var res = {
                Channel: params.ch,
                Estimation: 0.5001,
                Envelope: 1.0001
              };
              return res;
            }
        }  
        //
        // </EDIT TO MATCH YOUR PLUGIN>
        // ****************************


        /**
         * @brief   Include now an Init() function that uses the updated params from the init message 
         *          subscribed to, and launches whatever, since the load and param determinations 
         *          may happen later (not on first require), and since new Plugin() happens earlier
         *          than derived params are available.
         */
        this.Init = () => {
            // ***************************
            // <EDIT TO MATCH YOUR PLUGIN>
            // Do initializations here like:
            // 1. Load additional files, options, etc.
            // 2. Initialize child (fork) processes
            // 3. Counters, counts, blank/default/unpopulated UI element update if handled here
            console.log(`${pluginName}: this.Init() complete.`)
            // </EDIT TO MATCH YOUR PLUGIN>
            // ****************************
        } // end of Init

        
        /**
         * @brief This is where the DacqMan events are subscribed to and attached to method calls
         * @param {*} em Emitter event instance that will emit events to which the Plugin will subscribe
         */
        this.SetEv = (em) => {
            
            this.ev = em;

            // DATA
            // Note: the arrow function is very important to bind the "this"
            // to the Plugin function - otherwise "this" is the Emitter object and 
            // the class instance method can't be called like it is
            this.ev.on("dataSetReady", (data) => {

                // rawWaveformProcessing subscriber:
                // { data.chan: channel, data.wf: waveformSamples }

                //console.log(__filename, `${pluginName} received dataSetReady event`);
                //console.log(data);
                //console.log(this);
                
                // ***************************
                // <EDIT TO MATCH YOUR PLUGIN>
                this.theMainEdgeFunction( data.wf, function(error, result) {
                    console.log(`${pluginName}: theMainEdgeFunction res: ${result}`);
                });
                // </EDIT TO MATCH YOUR PLUGIN>
                // ****************************

            }); // .on dataSetReady
        
            // INIT
            // This plugin subscribes to the rawWaveformProcessing data available event
            this.ev.on('initRawWaveformProcessing', (data) => {
                // In addition to the constructor, in the wrapper class, add an init function
                // The wrapper itself encapsulates the knowledge of what additional options 
                // or files to use
                // data : {
                //    numChannels: dataIsNumChans,
                //    returnDataElementBaseName: eg: 'chartThickness'
                // }
                // ***************************
                // <EDIT TO MATCH YOUR PLUGIN>
                console.log(`${pluginName}: numChannels: ${data.numChannels}`);
                console.log(`${pluginName}: returnDataElementBaseName: ${data.returnDataElementBaseName}`);
                this.numChannels = data.numChannels;
                this.returnDataElementBaseName = data.returnDataElementBaseName;
                this.Init();
                // </EDIT TO MATCH YOUR PLUGIN>
                // ****************************
            }); // .on initRawWaveformProcessing

            console.log(`SetEv called for ${pluginName}`);
        
        } // end of this.SetEv

        /**
         * @brief   Should be included in the plugin as part of a sanity/compat check template
         * @returns
         */
        this.Ident = function() {
            return pluginName;
        } // end of this.Ident

    } // end of constructor

} // end of Plugin class



/**
 * @brief   Plugin should be the externally facing name as this is the common reference name
 *          in the calling/instantiating code. Internally it can refer to your class name like:
 *          Plugin : MyWrapperClassName
 */
module.exports = {
    Plugin : Plugin 
};