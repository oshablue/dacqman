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

// May be required in the wrapper directly, or in the child process wrapper:
var edge = require('electron-edge-js');

// May be required in the wrapper if the wrapper calls a child process
const { fork } = require('child_process');
const { timingSafeEqual } = require('crypto');

const pluginName = "stringLibraryWrapper";
const libName = "StringLibrary";

// </EDIT TO MATCH YOUR PLUGIN>
// ************************************************************************************
//
//



const libFileName = `${libName}.dll`;
const libPath = path.join(__dirname, libFileName);
// var libPresent = false;
// var theMainEdgeFunction = null;

// Needed only for when this wrapper directly wraps a dll and that dll may or may not be present
// </EXAMPLE FOR HANDLING TESTING WHEN LIBRARY IS NOT PRESENT>
if ( !fs.existsSync(libPath) ) {
    console.log(`Not found: ${libPath} returning from wrapper load or an alt edge func may be in place.`);
    //return false;
} else {
    libPresent = true;
}

if ( libPresent ) { 
    theMainEdgeFunction = edge.func({
        assemblyFile: libPath,
        typeName: `${libName}.Test`,
        methodName: 'CountLength'
    });
  } else {
    theMainEdgeFunction = function(params) {
      var res = {
        Channel: params.ch,
        Estimation: 0.5001,
        Envelope: 1.0001
      };
      return res;
    }
}     
// </EXAMPLE FOR HANDLING TESTING WHEN LIBRARY IS NOT PRESENT>


// <EXAMPLES OF FUNCTION DEFS AND CALLS>
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
// </EXAMPLES OF FUNCTION DEFS AND CALLS>



class Plugin {
    constructor ({
        // Place holder 
    } = {}) {

        // Events - for all plugins
        this.ev = null;
        this.libPresent = false;
        this.theMainEdgeFunction = null;


        // Define other properties as implemented by your plugin, according to the 
        // init signatures implemented in DacqMan
        // for example, for:
        // rawWaveformProcessing:
        this.numChannels = 1;
        this.returnDataElementBaseName = null;
        this.processingOptionsFile = null;

        if ( !fs.existsSync(libPath) ) {
            console.log(`Not found: ${libPath} returning from wrapper load or an alt edge func may be in place.`);
            //return false;
        } else {
            this.libPresent = true;
        }
        
        if ( this.libPresent ) { 
            this.theMainEdgeFunction = () => edge.func({
                assemblyFile: libPath,
                typeName: `${libName}.Test`,
                methodName: 'CountLength'
            });
        } else {
            // Just an example of defining it alternately
            this.theMainEdgeFunction = (params) => {
              var res = {
                Channel: params.ch,
                Estimation: 0.5001,
                Envelope: 1.0001
              };
              return res;
            }
        }  
        
        this.SetEv = (em) => {
            
            this.ev = em;
            // Note: the arrow function is very important to bind the "this"
            // to the Plugin function - otherwise "this" is the Emitter object and 
            // the method can't be called like it is
            this.ev.on("dataSetReady", (data) => {
                console.log(__filename, `${pluginName} received dataSetReady event`);
                //console.log(data);
                //console.log(this);
        
                // If not using the test array length function here, and rather handling 
                // a data set as defined for the rawWaveformProcessing, data is:
                // { data.chan, data.wf }
                // Don't use this. here for this function 
                // However it looks like other plugins 
                // try {
                //     this.Start();
                // } catch(e) { console.log(e)};
                this.theMainEdgeFunction( data.wf, function(error, result) {
                    console.log(`theMainEdgeFunction res: ${result}`);
                });
            });
        
            // This plugin subscribes to the rawWaveformProcessing data available event
            this.ev.on('initRawWaveformProcessing', function(data) {
                // In addition to the constructor, in the wrapper class, add an init function
                // The wrapper itself encapsulates the knowledge of what processingOptionsFile to use
                console.log(`${pluginName}: numChannels: ${data.numChannels}`);
                console.log(`${pluginName}: returnDataElementBaseName: ${data.returnDataElementBaseName}`);
                // try {
                //     this.Start();
                // } catch(e) { console.log(e)};
            });

            console.log(`SetEv called for ${pluginName}`);
        
        }

        this.Ident = function() {
            return pluginName;
        }

        

    } // end of constructor
} // end of Plugin class

//var ev; // why am i blanking on a better way to do this?

// var ident = function() {
//     return pluginName;
// }

// var sayHello = function(toWhoseLittleFriend) {
//     return `Al Pacino: Say Hello to My Little Friend, ${toWhoseLittleFriend}`;
// }

// var test = function() {

// }

// var setEv = function(em) {
//     ev = em;
//     ev.on("dataSetReady", function(data) {
//         console.log(__filename, `${pluginName} received dataSetReady event`);
//         //console.log(data);

//         // If not using the test array length function here, and rather handling 
//         // a data set as defined for the rawWaveformProcessing, data is:
//         // { data.chan, data.wf }
//         theMainEdgeFunction( data.wf, function(error, result) {
//             console.log(`theMainEdgeFunction res: ${result}`);
//         });
//     });

//     // This plugin subscribes to the rawWaveformProcessing data available event
//     ev.on('initRawWaveformProcessing', function(data) {
//         // In addition to the constructor, in the wrapper class, add an init function
//         // The wrapper itself encapsulates the knowledge of what processingOptionsFile to use
//         console.log(`${pluginName}: numChannels: ${data.numChannels}`);
//         console.log(`${pluginName}: returnDataElementBaseName: ${data.returnDataElementBaseName}`);
//     });

// }





module.exports = {
    Plugin
   // sayHello,
//   ident
//   , setEv
//   , test 
};