// mainWindow.js

// Dev Notes to Self
// Note that document.getElementById("myBtn").addEventListener('click', myFcn)
// will work when Content-Security-Policy (CSP) does not allow
// inline event handlers, like if CSP: script-src https://example.com/
// See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src




const electron = require('electron');
const {ipcRenderer } = electron;
const { dialog } = require('electron').remote; // is remote needed?
const ul = document.querySelector('ul');
const fs = require('fs');
const path = require('path');

var audioFdbk = require('./audioFdbk.js');
/*this.setTimeout(function(){
  audioFdbk.playOpen();
}, 1000);*/

//const edge = require('electron-edge-js');

// https://stackoverflow.com/questions/36980201/how-to-reset-nodejs-stream

// Create stream object for access by both sprenderer and charting
//const dataBuf = Buffer.alloc(100*4096, 0);
//const streamBuffers = require('stream-buffers');
const rsb = require('./readable_streambuffer.js');
const stream = require('stream');
// On platform for testing: using standard node stream buffers:
// At freq of 10 (ms)
// - chunkSize of 2 * 4095 gives steady sync graph, with eventual huge buffer (overrun)
// - chunkSize of 3 * 4095 gives walking graph and glitches due to emptiness (underrun)

const sprend = require('./sprenderer.js');
const SingleWfDataChart = require('./bigWfDataChart.js');

var YourFace = null;
const { UserInterface : YouFace } = require('./userInterface.js');


// <PLUGINS>

var plugins;
//var plugins = require('./plugins.js');
// Testing: // TODO move to unit testing
// setTimeout( () => {
//   plugins.pluginPushDataSet({
//     chan: 1, 
//     wf: Buffer.alloc(12, 0x5C, Uint8Array)
//   });
// }, 3000);

// </PLUGINS>



// 40000000 corresponds correctly to default HDL hardware sample rate
// However, this breaks legacy software in the old file format verification version
// that we have due to rounding/conversion errors in timebase going from a single to a double
// in the waveform object.
// So, using 25000000 happens to fit in with the legacy SW test version and
// allow flawless processing with default algorithm settings
// Otherwise, 40000000 loads up just fine.  It's just in the algo portion
// snapshot from the time that things break
const defaultHardwareWaveformSampleFrequencyHz = 40000000; //25000000; //40000000;
const defaultHardwareWaveformLengthSamples = 2500; //4095; //2500; // 4095; // TODO need to implement hardware-dependent size
const defaultHardwareWaveformBytesPerSample = 1;
const defWfLenB = defaultHardwareWaveformLengthSamples
                  * defaultHardwareWaveformBytesPerSample;

var singleChartBuf = Buffer.alloc(defWfLenB,127); //null;
var ourReadableStreamBuffer = null;
var writeStream = null;

// Variable declared here for access but initialized in sprenderer.js
var captureDataFileOutputBatch = null;

var currentWriteStreamFilepath = null;
var currentBytesCaptured = null;
var currentMaxCaptureFileSizeBytes = null;

// Defines how many full waveform lengths (or returned data set lengths, maybe including the SOF)
// are allowed for in the buffer read (and thus in some cases push to chart/graph)
// thus essentially creating the option to decimate the data that is actually
// graphed to reduce UI overhead
// For example, if you only ever graph the first waveform length, and the remaining
// multiples in a read threshold trigger event are not graphed, then you're
// decimating the data that is actually graphed/charted/plotted
var gChunkMultiple = null;

// Default. May alternately have functionality loaded with multiChart or similar
var gReturnDataTo = "chart";

var multiWfs = [];
var multiWfBufs = [];

var curChanToGraphSingle = 0;
var curChanToGraphMulti = 0;

const defNumChans = 8;
var numChans = defNumChans;

var prefs;
var customCommandsFilePath;
var customCommandsJson;









var MainWindowGetNumberOfChannels = function() {

  if ( captureDataFileOutputBatch ) {
    return captureDataFileOutputBatch.NumberOfChannels();
  } else {
    return numChans;
  }

}








var resetReadableStream = function(chunkMultiple) {

  console.log("resetReadableStream");

  curChanToGraphSingle = 0;
  curChanToGraphMulti = 0;
  singleChartBuf =  Buffer.alloc(defWfLenB, 127);

  // changing below to 20ms (and doubling the chunksize) doesn't stop the
  // crash malloc errors
  //chunkMultiple = 33; // 33 in our testing gives split between 8 chans, and no buffer overflow
  chunkMultiple = chunkMultiple || 3; // default to 3x
  gChunkMultiple = chunkMultiple;
  ourReadableStreamBuffer = new rsb.ReadableStreamBuffer({
    frequency: 10,       // in milliseconds // 5 or 7 was ok // 10 less crashy // less than 7ms to be faster than incoming packets of 4096
    chunkSize: (chunkMultiple*defWfLenB), //16380, //(4095)//,     // bytes -- 4096 gives a left-ward walk -- 4095 was generally steady
    initialSize: (100 * 1024),    // was 1000 // added these two for size management due to constant overflow
    //incrementAmount: (10 * 1024)  // zero does nothing - doesn't cap it
  });

  // Set up dumping all to file
  // Right so yeah - this will only go to the file, all of it
  // and we don't get any screen updates --
  // So fix the piping to mult distination via some intermediary readable stream?
  // Or we can perhaps manually handle the data in the chunk-tion below.
  // For 2 mins we got 62.4MB at default encoding
  // 128 * 4096 bytes ish * 120 = ... yes so, /1024 / 1024 => 60 MB ish or so
  /*if ( writeStream ) {
    ourReadableStreamBuffer.pipe(writeStream);
  }*/


  ourReadableStreamBuffer.on('readable', function(data) {

    //console.log("ourReadableStreamBuffer.(on).readable");

    try {

      var chunk;

      if ( ourReadableStreamBuffer.size() > (1000*1024) ) {
        console.log(ourReadableStreamBuffer.size());
        $('#btnBufferOverflowing').removeClass('disabled').addClass('orange pulse');
      } else {
        $('#btnBufferOverflowing').removeClass('orange pulse').addClass('disabled');
      }

      // Could try to:
      // - Increment the decimation counter here instead and it talks to the sprendered code
      // or
      // - Use 'data' event subscription instead and then use pause and resume to allow
      //   screen plotting to catch up
      while((chunk = ourReadableStreamBuffer.read()) !== null) {

        // TODO UI switch/checkbox to allow debug UI to do enable/disable such
        // functionality
        //console.log(chunk);

        // The channel to graph in the single waveform chart
        // NEXT: Move to UI for single-channel focused selection
        // Base 0
        var selectedChanToGraph = 0;

        chunk.copy(singleChartBuf, 0, 0, defWfLenB + 1); // TODO is the +1 needed?


        // This was for quick live demo updated functionality
        // If the chunk multiple was larger, then we were probably decimating
        // the data and wanting to just graph some interval of a single channel
        if ( gChunkMultiple > 3 && selectedChanToGraph == curChanToGraphSingle ) {
          singleWfChart.UpdateChartBuffer(singleChartBuf);
        }
        // Versus:
        // for smaller chunks, assume this is more of a single channel
        // scan or snapshot and that the chunk size does the decimation
        // sufficiently and we don't care about trying to always grab and
        // chart the same channel
        if ( gChunkMultiple < 4 ) {
          singleWfChart.UpdateChartBuffer(singleChartBuf);
        }

        // Sure, for now, basic testing, each chunk, whatever multiple, each
        // time we're here, just increment the channel number,
        // assuming that the multiple of chunk is set to intentionally
        // account for cycling through channels or the interaction is known
        // and correspondingly accounted for / set up
        curChanToGraphSingle += 1;



        // For plain old capture to plain file, earliest tests/functionality of file capture
        if ( writeStream ) {
          if ( currentMaxCaptureFileSizeBytes ) {
            if ( currentBytesCaptured < currentMaxCaptureFileSizeBytes ) {
              writeStream.write(chunk, 'hex');
              currentBytesCaptured += chunk.length;
              // We're still in system demo rapid drafting mode really ...
            }
          }
        }


        if ( prefs.interface === 'dataCaptureFocused' ) {

          // <TESTING>
            audioFdbk.playData(chunk);
          // </TESTING>

          if ( captureDataFileOutputBatch ) {

            // This module/class-instance parses out the data
            captureDataFileOutputBatch.ReceiveData(chunk);

            // The data capture and user interface code handles
            // pushing to the appropriate chart, separately/independently
            // from this code block
          } else {
            console.warn("mainWindow: readable stream buffer .on readable: "
              + "prefs is set to UI data capture focused, but the capture data fileoutput batch is not a thing (yet?)."
              + " If capture has ended this warning may just be from from a few last unprocessed buffers of data coming in."
              + " This is more likely if you have a lot happening on your PC at the same time this program is running. "
              + " Or this could simply be a single WF from putting the HDL into a single PAQ mode to stop acquisition. Chunk is:"
            );
            console.warn(chunk);
          }

        } else {

          // If we're not parsing waveforms (which at the moment, is only done
          // in the capture data file output batch module) then just dump to
          // waveform charts

          curChanToGraphMulti = curChanToGraphMulti == numChans ? 0 : curChanToGraphMulti;
          multiWfs[curChanToGraphMulti].UpdateChartBuffer(singleChartBuf);
          curChanToGraphMulti++;

        }

      }

    } catch (e) {
      console.log("Error in readable event: " + e);
    }
  }); // end of: our Readable Stream Buffer .on ( 'readable'

}





// TODO we can probably get this from the button definition too
// or configure it elsewhere
// TODO probably add some UI for when a chart isn't getting updated
// needs to track timeout ID, cancel it, and start a new timeout
// probably best to do in the chart code
// NEXT:
// Yes - let's go back to using what's in place in the button options json
// that is imported, regarding the capture buffer multiple option value.
// That should then be handled in user interface code, because that defines
// the user IF and does contain also the button option for this - so it can
// handle the call to publish the data to chart.  The capture-data
// code will create the data set and it can be pushed to the user interface
// and then user interface can decide how/when to call the chart object to
// update its data display
var decimate = 0;
var decimateKick = 31; // was 15 // TODO this will become either UI item or pref probably better
var MainWindowUpdateChart = function ( channelNumber, buf ) {

  // Decimate the data so we don't overwhelm the system...
  // Testing temporary with a simple multiple of total calls decimation
  decimate += 1;
  if ( decimate == decimateKick ) {
    decimate = 0;
    multiWfs[channelNumber - 1].UpdateChartBuffer(buf);
  }

}







// Basic demo of some ipc rendered window/interaction Electron type
// application functionality:
//
// Add item
ipcRenderer.on('item:add', function(e, item){
  ul.className = 'collection';
  const li = document.createElement('li');
  li.className = 'collection-item';
  const itemText = document.createTextNode(item);
  li.appendChild(itemText);
  ul.appendChild(li);
});
//
// Clear items
ipcRenderer.on('item:clear', function(){
  ul.innerHTML = '';
  ul.className = '';
});
// Remove item on double-click from main  list
// TODO if using this test functionality:
// How was this / should this be implemented?:
//ul.addEventListener('dblclick', removeItem);
function removeItem(e){
  e.target.remove();
  if(ul.children.length == 0){
    ul.className = '';
  }
}






// This is retained for legacy/early stage dev reference -
// but it's probably not used any more as the data parsing functionality
// happens in sprenderer and capture data mostly now
ipcRenderer.on('port:ondata', function(e, data){
  chart.update(data);
});


ipcRenderer.on('log', function(e, data) {
  console.log("ipc log event: " + data);
});






// Preferences/settings basics
function showUserPrefsData() {
  console.log("sending prefs:show from ipcRenderer");
  ipcRenderer.send('prefs:show');
}

ipcRenderer.on('prefs:show', function(e, data) {
  console.log("prefs:show: " + JSON.stringify(data));
});

function resetPrefsToDefaults() {
  console.log("resetting prefs to defaults...");
  ipcRenderer.send('prefs:reset');
}

function getPref(key) {
  return ipcRenderer.sendSync('prefs:get', key);
}





// Moved to after DOM loaded
// User Interface selection and instantiation
/*YourFace = new YouFace({
  uiRegularDivs: ['#singleWaveformChartAccordion', '#multiWaveformChartAccordion'],
  uiDataCaptureFocusedParentDiv: '#capture_ui',
  mainWindow: this
});*/

function setPrefToInterfaceRegular(btn) {
  let ui = btn.getAttribute("value");
  console.log("setting preference to use Regular Interface");
  ipcRenderer.send('prefs:set', { 'key':'interface', 'value':'regular'});
  YourFace.SwitchInterface(ui);
}

function setPrefToInterfaceDataCaptureFocused(btn) {
  let ui = btn.getAttribute("value");
  console.log("setting preference to use Data Capture Focused Interface");
  ipcRenderer.send('prefs:set', { 'key':'interface', 'value':'dataCaptureFocused'});
  YourFace.SwitchInterface(ui);
}

function setPrefToggleRangeSliderValues(btn) {
  // If includes Restore, then currently set to not restore the value and should be changed to restore it
  var yesRestoreRangeValues = true;
  btn.innerHTML.startsWith('Restore') ? yesRestoreRangeValues = true : yesRestoreRangeValues = false;
  if ( yesRestoreRangeValues ) {
    btn.innerHTML = btn.innerHTML.replace('Restore', 'Do not restore');
  } else {
    btn.innerHTML = btn.innerHTML.replace('Do not restore', 'Restore');
  }
  //let ui = btn.getAttribute('value');
  var p = prefs.customControlSettingsJson;
  p.restoreRangeSliderValues = yesRestoreRangeValues;
  setKeyAndReloadPrefs('customControlSettingsJson', p);
}

function setPrefToggleTextInputValues(btn) {
  //let ui = btn.getAttribute('value');
   // If includes Restore, then currently set to not restore the value and should be changed to restore it
   var yesRestoreTextValues = true;
   btn.innerHTML.startsWith('Restore') ? yesRestoreTextValues = true : yesRestoreTextValues = false;
   if ( yesRestoreTextValues ) {
     btn.innerHTML = btn.innerHTML.replace('Restore', 'Do not restore');
   } else {
     btn.innerHTML = btn.innerHTML.replace('Do not restore', 'Restore');
   }
   //let ui = btn.getAttribute('value');
   var p = prefs.customControlSettingsJson;
   p.restoreTextInputValues = yesRestoreTextValues;
   setKeyAndReloadPrefs('customControlSettingsJson', p);
}





// Prevent Closing when work is running or do something else before
// the window is closed
window.onbeforeunload = (e) => {
  //e.returnValue = false;  // this will *prevent* the closing no matter what value is passed

  //if(confirm('Do you really want to close the application?')) {
  //  win.destroy();  // this will bypass onbeforeunload and close the app
  //}

  ipcRenderer.send('prefs:storeWindowBounds');

};






// NEXT: this, animStarted, tracking/use is a bit clunky
var animStarted = false;
function mainWindowUpdateChartData(data) {

  console.log("mainWindowUpdateChartData: gReturnDataTo: " + gReturnDataTo);
  console.log("mainWindowUpdateChartData: animStarted: " + animStarted);

  if ( data !== null ) {
    console.log("ERROR: mainWindowUpdateChartData is not implemented \
      in this configuration for regular calls.  Currently, chart is expected to use    \
      requestAnimationFrame and thus just the first call initiates the looped calls.");
  }

  if ( !animStarted ) {
    resetReadableStream();   // Or move to data Port event handler for close()?
    console.log("mainWindowUpdateChartData: animStarted = false, calling renderChart()");
    singleWfChart.RenderChart();
    animStarted = true;

    if ( gReturnDataTo === "multiChart") {
      var i = 0;
      for ( i = 0 ; i < numChans ; i++ ) {
        multiWfs[i].RenderChart();
      }
    }

    // Update the UI status indicator showing Graph/Data Listening

  } else {
    console.log("mainWindowUpdateChartData: animStarted = true, calling cancelRenderChart()");
    singleWfChart.CancelRenderChart();
    animStarted = false;

    if ( gReturnDataTo === "multiChart") {
      var i = 0;
      for ( i = 0 ; i < numChans ; i++ ) {
        multiWfs[i].CancelRenderChart();
      }
    }
    // Update the UI status indicator showing Graph/Data Not Listening

  }
}







// Serial port -- selection and basics, from early / legacy dev
// NEXT: can probably eliminate some of these mainWindow wrappers
// and simply make sure the module is loaded and items exported and
// just call directly perhaps ... or keep them as wrappers for flexibility
// maybe?
function serialSelect(button) {
  var d = document.querySelector("#activePort");
  $('#activeSerialPortStuff').show();
  d.innerHTML = button.name;
}
function serialCheckbox(checkbox) {
  sprend.serialCheckbox(checkbox);
}
function serialOpen() {
  var d = document.querySelector("#activePort");
  var spname = d.innerHTML;
  sprend.serialOpenByName(spname);
}
function serialClose() {
  sprend.serialClose();
}
function controlPortClose() {
  sprend.controlPortClose();
}
function controlPortOpen() {
  sprend.controlPortOpen();
}
function serialTestWrite() {
  sprend.serialTestWrite();
}
function serialSendData(commandAndType, returnDataTo) {
  sprend.serialSendData(commandAndType, returnDataTo);
}
function controlPortSendData(commandAndType, returnDataTo, button, outputDirectory) {
  // We capture and send the button item as well to be able parse and handle
  // any options that are not specified at the command level of the tree
  sprend.controlPortSendData(commandAndType, returnDataTo, button, outputDirectory);
}
function beginSerialComms() {
  sprend.beginSerialComms();
}
function btnDataPortClick(button) {
  sprend.btnDataPortClick(button);
}
function btnControlPortClick(button) {
  sprend.btnControlPortClick(button);
}
function controlPortSendStuff() {
  sprend.controlPortSendStuff($('#stuffToSend'));
}
function controlPortSendDataFromTextInput(button, commandAndType) {
  sprend.controlPortSendDataFromTextInput(button, commandAndType);
}
function silenceIndicators(button) {
  $("#btnListeningForData").removeClass('pulse');
  $("#btnDataPortStatus").removeClass('pulse');
  $(button).addClass('disabled');
}
function cancelCustomControlButtonCommand() {
  return new Promise ( (resolve, reject) => {
    resolve (sprend.cancelCustomControlButtonCommand() );
  });
}






// Chart / graphing / data view items - Single
var singleWfChart; /* = new SingleWfDataChart({
  parentElementIdName: "chart",
  chartBuffer: singleChartBuf
});*/ // need to re-assign after DOM load to catch the right DOM ele (chart)








// Be careful with sendSync - even though we need it here to guarantee the
// return of the prefs for next code, if there is a hang up, reload and quit
// stop working and you need for force quit somehow (Ctrl-c command line
// or some app force quit menu items somewhere ... apparently)
let getPrefsPromise = () => {
  return new Promise((resolve, reject) => {
    prefs = ipcRenderer.sendSync('prefs:getPrefs') || {};
    console.log("Prefs: " + JSON.stringify(prefs));
    if ( !prefs ) {
      reject("getPrefsPromise: failed to get prefs");
    } else {
      resolve(prefs);
    }
  });
}





///
// Use longest filename ending with custom.css or otherwise use the first 
// of whatever non-custom.css ending stylesheet is there
let selectStylesheet = () => {

  var eleHead = document.getElementsByTagName('head')[0]; //.getElementById('stylesheet');
  var ele = $(eleHead).find('#stylesheet');
  var files = fs.readdirSync('css/');
  console.log(`Files: ${files}`);
  var nonCustomFiles = [];
  var customFiles = [];
  if ( files ) {
    nonCustomFiles = files.filter( function (f) {
      return f.endsWith('custom.css') == false;
    })
    customFiles = files.filter( function (f) {
      return f.endsWith('custom.css') == true;
    })
  }
  console.log(`Files: ${nonCustomFiles} ${customFiles}`);
  var longestCustom = '';
  // get longest
  if ( customFiles ) {
    longestCustom = customFiles.reduce(
      function( a, b) {
        return a.length > b.length ? a : b;
      }
    )
  }

  var cssToUse = $(ele).prop('href');       // here the css/ dir prefix exists
  console.log(`cssToUse: ${cssToUse}`);
  if ( nonCustomFiles ) {
    cssToUse = `css/${nonCustomFiles[0]}`;           // but here it doesn't so add it back in
  } else {
    if ( customFiles && longestCustom ) {
      cssToUse = `css/${longestCustom}`;             // but here it doesn't so add it back in
    }
  }
  console.log(`cssToUse: ${cssToUse}`);
  $(ele).prop('href', cssToUse);

}





let  loadCustomCommandsPromise = (prefs) => {

  // TODO there is probably a problem with the try/catch inside the promise
  return new Promise((resolve, reject) => {

    // What happens if custom file and user deletes it?
    customCommandsFilePath = prefs.customCommandsFilePath || '';

    fs.stat(customCommandsFilePath || '', function (err, stat) {
      if ( !err ) {
        console.log("Loading customCommandsFilePath: " + customCommandsFilePath);
        customCommandsJson = require(customCommandsFilePath) || '';
        resolve(customCommandsJson);
      } else {
        console.log("Filepath in preferences for customCommandsFilePath, " + customCommandsFilePath + ", does not exist ... defaulting to packaged fallback");
        try {
          customCommandsJson = require(prefs.customCommandsFilePathPackaged);
          resolve(customCommandsJson);
        } catch (e) {
          console.log("Problem loading customCommandsFilePathPackaged..." + e);
          customCommandsJson = JSON.parse("{}");
          console.log(customCommandsJson);
          reject(customCommandsJson);
        }
      }
    });
  }); // end of new Promise

}







$(document).ready(function(){ // is DOM (hopefully not img or css - TODO vfy jQuery functionality for this)

  setTimeout(function(){
    audioFdbk.playOpen();
  }, 1000);


  selectStylesheet();


  sprend.vcpFind();
  sprend.ftdiFind();

  YourFace = new YouFace({
    uiRegularDivs: ['#singleWaveformChartAccordion', '#multiWaveformChartAccordion'],
    uiDataCaptureFocusedParentDiv: '#capture_ui',
    mainWindow: this
  });

  getPrefsPromise()
    .then(prefs => loadCustomCommandsPromise(prefs))
    .then( function(customCommandsJson) {
      loadButtons(customCommandsJson);
      // HOOKALERT03:
      var useRangeSilders = true;
      prefs.customControlSettingsJson.showAsTextInputs ? useRangeSliders = false : useRangeSliders = true;
      $(".switch").find("input[type=checkbox]").attr('checked', useRangeSliders); // true);
      // TODO move to menu update function - extract
      var rsvText = "";
      prefs.customControlSettingsJson.restoreRangeSliderValues ? 
        rsvText = "Do not restore range slider values" :
        rsvText = "Restore range slider values";
      $('#aToggleRangeSliderValues').text(rsvText);
      var tivText = "";
      prefs.customControlSettingsJson.restoreTextInputValues ? 
        tivText = "Do no restore text input values" :
        tivText = "Restore text input values";
      $('#aToggleTextInputValues').text(tivText);
      // HOOKALERT03 may want to select based on stored value for slide/txt in prefs.customControlSettingsJson
      showCustomControlsAsRangeSliders(useRangeSliders, customCommandsJson); //true, customCommandsJson);
      $('.collapsible').collapsible({
        accordion: true
      });
      YourFace.Load(prefs.interface, prefs.interfaceRefinement, customCommandsJson.uiDataCaptureFocused);
      if ( prefs.boolUsePlugins ) {
        plugins = require('./plugins.js');
      } else {
        console.warn("prefs.boolUsePlugins = false; Skipping require (and load) plugins.");
      }
      return;
    })
    .catch ( e => {
      console.error("Error loading prefs and customCommandsJson from file: " + e);
    })


  // Check for stuff that needs to execute on page load after population
  // For our win32 VM 8.1 Pro - this timeout lets things load on launch
  // and then fires the test to see if we can show the proceed button
  // Without it, the button doesn't show, as not all is loaded in time
  // Easy to update for other sequential functionality of course.
  setTimeout( function() {
    serialCheckbox(); // arg not used ... TODO better way to do this of course
  }, 2000);


  // Chart / graphing / data view items - Single
  // Initialize after DOM load to send the right chart ele parent
  singleWfChart = new SingleWfDataChart({
    parentElementIdName: "chart",
    chartBuffer: singleChartBuf,
    dataLen: defWfLenB
  });


  setupMultipaneCharts($("#divMultichart"), numChans);


  $('.sidenav').sidenav();
  $(".dropdown-trigger").dropdown();
  
  //$('.modal').modal();
  // Or specifically:
  $('#modal-hardwareSelect').modal({
    onCloseStart: function() {
      //console.log("modal-hardwareSelect closed");
      //modalHardwareSelectHello();
      modalHardwareSelectCloseStartFunction();
      sprend.setHardwareByFullname(
        $('#modal-hardwareSelect input:checked').closest('label').children('span').text()
      );
      // TODO 
      // sprend.setHardware(this?);
      // this is the modal div I think
      // $('.modal-content input').filter(':checked') returns the input
    },
    onOpenStart: function() {
      sprend.setupModalHardwareSelect();
    }
  })

});





var SetupMultipaneCharts = function( nChans, chartDivClasses ) {
  numChans = nChans;
  var d = $('#divMultichart');
  d.empty();
  setupMultipaneCharts(d, nChans, chartDivClasses);
  $('#multiWaveformChartAccordion').collapsible("open");
  mainWindowUpdateChartData(null); // to reset render loops
}







var setupMultipaneCharts = function (parentEle, nChans, chartDivClasses) {

  // TODO add some click or similar to allow fullscreen or class change to
  // single column for charts? etc.

  // How many charts to display per row for particular @media size
  var divClasses = chartDivClasses ? chartDivClasses : "col s12 m6 l4";

  var i;
  multiWfs = [];
  multiWfBufs = [];
  for ( i = 0; i < nChans; i++ ) {
    var buf = Buffer.alloc(4095, 127);
    var idName = "divMultipaneChart" + i;
    var idChartProcessedWfInfoName = "chartProcessedWfInfo" + i;
    var dChartBlock = $(document.createElement("div"))
      //.addClass("col s12 m6 l4")
      .addClass(divClasses)
      ;
    var dHeader = $(document.createElement("div"))
      .addClass("divMultiChartTitleArea")
      //.text("Channel " + (i+1))
      ;
    var dHeaderPrefixSpan = $(document.createElement("span"))
      .text("Channel " + (i+1))
      ;
    var dHeaderUpdatedDataSpan = $(document.createElement("span")) // <PLUGIN /> //
      .attr("id", idChartProcessedWfInfoName)
      .attr("style", "float:right")
      .text("Processed WF Info " + (i+1))
      ;
    var d = $(document.createElement("div"))
      .addClass("multipaneChart") // col s12 m6 l4")
      .attr("id", idName)
      ;

    $(dChartBlock).append(dHeader).append(dHeaderPrefixSpan).append(dHeaderUpdatedDataSpan).append(d);
    $(parentEle).append(dChartBlock);

    multiWfBufs.push(buf);
    var multiWfDataChart = new SingleWfDataChart({
      parentElementIdName : idName,
      title: "Channel " + (i+1),
      chartBuffer : buf
    });
    multiWfs.push(multiWfDataChart);
  }

} // End of: setupMultipaneCharts







var showCustomControlsAsRangeSliders = function ( boolShowAsSliders, customCommandsJson ) {
  if ( boolShowAsSliders ) {

    parseAndShowCustomTextInputsAsRangeSliders(customCommandsJson);

  } else {

    parseAndShowCustomTextInputsAsButtonsAndTextInputs(customCommandsJson);

  }
}





// TODONOW: Implement the dataCaptureFocused START and STOP buttons
// Loads button descriptions and associated command definitions from the
// json files into the UI
function loadButtons(customCommandsJson) {

  console.log("loadButtons: customCommandsJson: " + customCommandsJson); // JSON.stringify(customCommandsJson||''));

  // TODO use meta list for button files to be loaded and for various port-style devices

  // TODO this is kinda rambling, no?

  // Basic test functions and single-port style device buttons (aka DLITE legacy)
  // Can use user data path instead when running live not dev
  // Previous generation of basic default buttons for demos ...
  const path = "./user-data/buttons-example.json"
  var buttons = require(path).buttons;
  console.log(buttons.length + " buttons found.");
  buttons.forEach( function (b) {
    var newb = $('<button/>')
      .text(b.title)
      .prop('title', b.description)
      .click(function () {
        //alert(b.command.type + ': ' + b.command.value)
        //serialSendData(b.command, b.returnDataTo);
        controlPortSendData(b.command, b.returnDataTo, b);
      });
    $('#serialButtonsFromFileDiv').append(newb);
  });
  // These(above) are not at this writing actually loaded into the document anymore
  // to simplify the IF


  //const cp_path = "./user-data/control-port-buttons.json"
  // At current development, textInputs is at the top level
  // while controlGroups have buttons children
  //var controlGroups = require(cp_path).controlGroups;



  // <SLIDERS>
  // Add text input to range slider switch and header in collapsible
  var collVariableInputNodes = $($.parseHTML(
      '<ul class="collapsible collapsible-accordion">'
    + '  <li class="active">'
    + '   <a class="collapsible-header">Custom Control Range Sliders/Text inputs Loaded From File'
    + '      <i class="material-icons medium sidenav-dd-expand">play_arrow</i>'
    + '   </a>'
    + '   <div id="divCustomControlVariableInputs" class="collapsible-body"></div>'
    + '  </li>'
    + '</ul>'
  ));

  var swChk = $('<input />', { type: 'checkbox' });
  var swSpLev = $(document.createElement("span"))
  .addClass("lever");
  var swLbl = $(document.createElement("label"))
  .append("Text Inputs")
  .append(swChk)
  .append(swSpLev)
  .append("Range Sliders")
  ;
  var switchRangeOrTextInput = $(document.createElement("div"))
  .addClass("switch")
  .append(swLbl)
  ;
  var spanTextInputControlTitle = $(document.createElement("span"))
  .prop("id", "spanTextInputControlTitle")
  .addClass("grey-text")
  .addClass("text-darken-3")
  .text("Custom Control Text Inputs Loaded From File")
  ;
  var textInputControlTitle = $(document.createElement("p"))
  //.text("Custom Control Text Inputs Loaded From File")
  .addClass("custom-control-section")
  .append(spanTextInputControlTitle)
  .append(switchRangeOrTextInput)
  ;

  $(collVariableInputNodes).find('.collapsible-body').append(textInputControlTitle);
  $('#controlPortButtonsFromFileDiv')
  //.append(textInputControlTitle)
  .append(collVariableInputNodes);
  ;

  $(".switch").find("input[type=checkbox]").on("change",function() {
    var boolShowAsRangeSlider = $(this).prop('checked'); // Checked = Right side = Range Sliders
    // HOOKALERT03:
    var cust = prefs.customControlSettingsJson;
    cust['showAsTextInputs'] = !boolShowAsRangeSlider;
    setKeyAndReloadPrefs('customControlSettingsJson', cust);
    // </ HOOKALERT03 >
    showCustomControlsAsRangeSliders(boolShowAsRangeSlider, customCommandsJson);
  });
  // </SLIDERS>



  var controlGroups = customCommandsJson.controlGroups;
  if ( !controlGroups) {
    console.log("No control groups in customCommandsJson ... returning");
    return;
  }

  var collButtonNodes = $($.parseHTML(
        '<ul class="collapsible collapsible-accordion">'
      + '  <li>' // class="active">' // uncomment => active = uncollapsed
      + '   <a class="collapsible-header">Custom Control Buttons Loaded From File'
      + '      <i class="material-icons medium sidenav-dd-expand">play_arrow</i>'
      + '   </a>'
      + '   <div id="divCustomControlButtons" class="collapsible-body"></div>'
      + '  </li>'
      + '</ul>'
    ));

  var cgRow = $(document.createElement("div"))
    .attr("id", "divCtrlGrp")
    .addClass("row")
    ;
  controlGroups.forEach( function ( cg ) {
    var buttons = cg.buttons;
    var d = $(document.createElement("div"))
      .attr("id", "divCtrlGrp" + cg.name.replace(/\s/g,''))
      .addClass("control-group col s4")
      ;
    var groupTitle = $(document.createElement("p"))
      .text(cg.name)
      .addClass("control-group")
      ;
    d.append(groupTitle);
    console.log(buttons.length + " control port buttons in controlGroup " + cg.name + " found.");
    buttons.forEach( function (b) {
      var newb = $('<button/>')
        .text(b.title)
        .prop('title', b.description)
        .click(function () {
          controlPortSendData(b.command, b.returnDataTo, b);
        });
      d.append(newb);
    });
    cgRow.append(d);
  });

  // Append now a UI feedback group
  var d = $(document.createElement("div"))
    .attr("id", "divCtrlGrpBtnUiFeedback")
    .addClass("control-group col s4")
    ;
  var groupTitle = $(document.createElement("p"))
    .text("Command Progress")
    .addClass("control-group")
    ;
  d.append(groupTitle);

  var pbar = $(document.createElement("div"))
    .attr("id", "divProgressBar")
    .addClass("progress")
    .append($.parseHTML('<div id="theBarItself" class="determinate" style="width: 0%;"></div>'))
    ;
  d.append(pbar);

  var cancelAndOutput = $(document.createElement("div"))
    .addClass("row")
    ;
  var cancelb = $(document.createElement("button"))
    .addClass("cancel")
    .click( function() {
      cancelCustomControlButtonCommand();
    })
    .append($.parseHTML('<i class="small material-icons">cancel</i>'))
    ;
  var dbtn = $(document.createElement("div"))
    .addClass("col s2")
    ;
  dbtn.append(cancelb);
  cancelAndOutput.append(dbtn);

  var logTicker = $(document.createElement("div"))
    .addClass("col s9")
    .attr("id","divControlActionLog")
    .append($.parseHTML(''
        + '<pre class="mini">'
        +   '<div id="cmdOutput">Cmd replies...\r\n</div>'
        + '</pre>'
      ))
    ;

  cancelAndOutput.append(logTicker);
  d.append(cancelAndOutput);
  cgRow.append(d);



  $(collButtonNodes).find('.collapsible-body').append(cgRow);
  $('#controlPortButtonsFromFileDiv').append(collButtonNodes); //(cgRow);

  // End of buttons added to control groups added to the div

  // <SLIDERS> was here </SLIDERS>

  

  parseAndShowCustomTextInputsAsButtonsAndTextInputs(customCommandsJson);

  // Now add check if any special UI-destined buttons should be loaded and exist
  // and then load them
  /*
  console.log(`getPref: ${getPref('interface')}`);
  let ui = getPref('interface');
  if ( ui == 'dataCaptureFocused') {
    var j = customCommandsJson.uiDataCaptureFocused;
    if ( j ) {
      YourFace.AddButtonLogicFromJson(j);
    } else {
      console.log(`pref is for uiDataCaptureFocused but custom json aka eg control-port-buttons json for uiDataCaptureFocused is: ${j} - nothing to populate`);
    }
  }
  */

}








var loadTextInputs = function (customCommandsJson) {

  // Dual-port style functions
  //
  // Control port
  //const cp_path = "./user-data/control-port-buttons.json"
  // At current development, textInputs is at the top level
  // while controlGroups have buttons children
  //var controlGroups = require(cp_path).controlGroups;
  //var buttons = require(cp_path).buttons;
  //var textInputs = require(cp_path).textInputs;
  var textInputs = customCommandsJson.textInputs;

  return textInputs;

}





// TODO BROKEN !!

var setKeyAndReloadPrefs = function (keyToSet, valToSet) {
  prefs = ipcRenderer.sendSync('prefs:set', { 'key': keyToSet, 'value': valToSet})
  // .then( function () {
  //   prefs = ipcRenderer.sendSync('prefs:getPrefs') || {};
  //   return prefs;
  // })
  console.log(JSON.stringify(prefs));
}








var parseAndShowCustomTextInputsAsRangeSliders = function(customCommandsJson) {

  var textInputs = loadTextInputs(customCommandsJson);

  // HOOKALERT03:
  var textSettingsJson = prefs.customControlSettingsJson || {};

  if ( !textInputs || textInputs.length < 1 ) {
    return;
  }

  $("div[id^='divTextInputRow']")
    .remove()
    ;

  var inputRowDiv = $('<div>')
    .prop('id', "divTextInputRow") // + inputCnt)
    .addClass("row")
    ;

  var myAddTo = $('#divCustomControlVariableInputs'); // $('#controlPortButtonsFromFileDiv');

  var theRangeForm = $(document.createElement("form"))
    .attr("action", "#");

  textInputs.forEach( function(ti) {
    // HOOKALERT03:
    var idBaseToUse = ti.label.replace(/\s/g, '') || "idBaseToUse";
    // </HOOKALERT03 
    var range = $(document.createElement("p"))
      .text(ti.label)
      .addClass("range-field")
      .addClass("col s6")                           // 2 per row
      .addClass(ti.class)
      .append($('<input />', { type: 'range'
        , class: 'control-range'
        , id: 'range' + idBaseToUse //ti.label.replace(/\s/g, '')
        , min: ti.min, max: ti.max, step: 1
        , value: ti.default
        , title: ti.description
      }));
    // HOOKALERT03 
    if ( textSettingsJson.hasOwnProperty(idBaseToUse)  
    && textSettingsJson.restoreRangeSliderValues )
    {
      //range.val(textSettingsJson[idBaseToUse]); // NOPE
      range.find('input[id^=range]').prop('value', textSettingsJson[idBaseToUse]); // YUP
      // TODO ranges don't send data until they change, so restoring their value 
      // doesn't mean the hardware has that updated data value 
      // So we need a UI indicator that indicates value not yet sent until the value is sent 
      // Unless, wait ...
    }
    // </HOOKALERT03
    $(range).on("change", function() {
      // HOOKALERT03
      var val = $(this).find('input[id^=range]').val();
      var idToStore = idBaseToUse; //ti.label.replace(/\s/g, ''); // TODO maybe we don't want the prefix just the label
      console.log(`val: ${val} and idToStore: ${idToStore}`);
      textSettingsJson[idToStore] = val;
      setKeyAndReloadPrefs( 'customControlSettingsJson', textSettingsJson);
      // </ HOOKALERT03 >
      controlPortSendDataFromTextInput(this, ti.command);
    });
    theRangeForm.append(range);
  });

  inputRowDiv.append(theRangeForm);
  myAddTo.append(inputRowDiv);

  M.Range.init($('.control-range')); //$('input[type="range"]')); // or this

  YourFace.RefreshFormatRefinement();

}








var parseAndShowCustomTextInputsAsButtonsAndTextInputs = function (customCommandsJson) {

  var textInputs = loadTextInputs(customCommandsJson);
  var textInputsTitle = customCommandsJson.sectionTitles.textInputsTitle;
  // HOOKALERT03:
  var textSettingsJson = prefs.customControlSettingsJson || {};

  if ( textInputs.length < 1 ) {
    return;
  }

  if ( textInputsTitle && textInputsTitle.length > 0 ) {
    $('#spanTextInputControlTitle').text(textInputsTitle);
  }

  $("div[id^='divTextInputRow']")
    .remove()
    ;

  var inputCnt = 1;
  var inputRowDiv = $('<div>')
    .prop('id', "divTextInputRow" + inputCnt)
    .addClass("row")
    ;
  // To make 3 pairs per row, change below from s2 to s3
  // and change below further: % 4 to % 3 (change the modulus)
  
  textInputs.forEach( function (ti) {
    // HOOKALERT03:
    var idBaseToUse = ti.label.replace(/\s/g, '') || "idBaseToUse";
    // </HOOKALERT03 
    var containerDiv = $('<div>')
      .addClass("col s3")
      .addClass(ti.class)
      .prop('id', "container" + idBaseToUse); // ti.label.replace(/\s/g, ''))
      ;
    var smallDiv = $('<div>')           // for button
      .addClass("right-align col s8")
      ; // col s2 // s4 for simplified DCF mode
    var smallDiv2 = $('<div>')          // for text/label
      .attr("id", "div" + idBaseToUse) // ti.label.replace(/\s/g, ''))
      .addClass("left-align col s4") // col s1 // s4 for simplified DCF mode
      .addClass(ti.class)
      ;
    //var wrapTogether = $('<div>')
    //  .addClass("text-input-pair");
    //console.log($(ti.label.split(" ")).last());
    var span = $("<span>").text(ti.label.split(" ")); //.pop()); //ti.label); // .pop gets last element from array
    var input = $("<input type='text'>")
      .addClass("input-field")
      .prop('title', ti.description)
      .prop('id', "input" + idBaseToUse)
      ; // ti.label.replace(/\s/g,''));
    // HOOKALERT03 
    // hopefully only stored if valid! TODO ... :)
    if ( textSettingsJson.hasOwnProperty(idBaseToUse)  
      && textSettingsJson.restoreTextInputValues )
    {
      input.val(textSettingsJson[idBaseToUse]);
    }
    // </HOOKALERT03
    var button = $("<button>")
      .text(ti.label)
      .addClass("btn-small waves-effect waves-light")
      .addClass(ti.class)
      .prop('id', "button" + ti.label.replace(/\s/g, ''))
      .prop('title', ti.description)
      .click(function () {
        // HOOKALERT03 grab and store value
        // CAUTION: There is an issue with this.  Please see README.  It was a customer request.
        // However, it is not actually something necessarily desirable or even functional 
        // in the real world, especially for range sliders.
        // Go up parent stack a bit and then over and down to grab the adjacent 
        // relevant input. Could also do with id extraction and renaming
        // since some root id is preserved i believe
        // This works:
        //var val = $(this).closest('div').siblings().first().find('input').val();
        // So however does this:
        var inputId = "#input" + ti.label.replace(/\s/g,'');
        var val = parseInt($(inputId).val());
        if ( (val || val === 0) && val >= ti.min && val <= ti.max ) {
          // val = parseInt( $(ti).val() ); // TODO
          // TODO also sanitize and bounds
          // Options below:
          //var idToStore = $(this).closest('div').siblings().first().find('input').prop('id');
          // gets like inputRxDelay or rangeRxDelay, whereas below id becomes just RxDelay
          var idToStore = ti.label.replace(/\s/g,'');
          console.log(`idToStore: ${idToStore} and val: ${val}`);
          // And store the value now
          textSettingsJson[idToStore] = val;
          setKeyAndReloadPrefs( 'customControlSettingsJson', textSettingsJson);
          //ipcRenderer.set('customControlSettingsJson', textSettingsJson);

          // actually i think we just want the ti.label replaced to store the value 
          // TODO now store in correct prefs json and write to settings hopefully
          // TODO below we should really make sure the command was executed successfully and 
          // then store the value
          // </ HOOKALERT03 >
          controlPortSendDataFromTextInput(this, ti.command);
        } else {
          alert (`Something doesn't look quite right with the value you are trying to send. 
          The value should be an integer number and greater than or equal to ${ti.min}
          and less than or equal to ${ti.max}.  You can always change the min max bounds in the 
          control-port-buttons.json file.`);
        }
      });
    var label = $("<label>")
      .attr("for", ti.label.replace(/\s/g,''));
    $(label).append(input).append(span);
    var c1 = $(smallDiv).append(button);
    var c2 = $(smallDiv2).append(label);
    var c3 = $(containerDiv).append(c1).append(c2);
    //$(wrapTogether).append(c1).append(c2);
    //$(inputRowDiv).append(wrapTogether); // c1).append(c2);
    $(inputRowDiv).append(c3); //append(c1).append(c2);
    // Create the text inputs, grouped by rows of 3
    console.log("inputCnt: " + inputCnt + " textInputs.length: " + textInputs.length );
    if ( inputCnt % 4 == 0 ) {
      //$('#controlPortButtonsFromFileDiv').append(inputRowDiv);
      $('#divCustomControlVariableInputs').append(inputRowDiv);
      inputRowDiv = $('<div>')
        .prop('id', "divTextInputRow" + inputCnt)
        .addClass("row")
        ;
    } else if ( inputCnt == textInputs.length ) {
      //$('#controlPortButtonsFromFileDiv').append(inputRowDiv);
      $('#divCustomControlVariableInputs').append(inputRowDiv);
    }
    inputCnt++;
  });

  YourFace.RefreshFormatRefinement();

}







var copyCustomCommandsToLocalFile = function() {

  // https://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
  // destination.txt will be created or overwritten by default.
  /*
  var currentWriteStreamFilepath;
  currentWriteStreamFilepath = dialog.showSaveDialog( {
    options : {
      title : 'Copy the customizable command controls file locally to ...',
      buttonLabel: 'Copy'
    }
  });
  */
  // TODO check for and if non-existent add a .json file extension
  // That is mandatory for proper import of the file, otherwise it's not parsed
  // by the node engine module(s) correctly
  //console.log("file picker result: " + currentWriteStreamFilepath);

  const app = require('electron').remote.app;
  var a = app.getAppPath();
  console.log("getAppPath: " + a);
  var path = require('path');
  //var srcFilePath = path.join(a, prefs.customCommandsFilePathPackaged);
  //console.log("srcFilePath: (if using single-file copy)" + srcFilePath);

  var currentWriteStreamDirectory;
  currentWriteStreamDirectory = dialog.showOpenDialog( {
    title : 'Select and/or create your custom directory for customizable config files...',
    buttonLabel: 'Copy Config Files to this Directory',
    properties: [ 'openDirectory', 'createDirectory']
  });

  // Now switching to directory-based method and copying all files over
  // to the custom selected directory
  // TODO could add a readme file too => indicating to keep the same filename
  // and indicating that you used to be able to customize the filename and that
  // you still could by updating the code here if you like
  var srcFilePaths = [];
  srcFilePaths.push({ 'key': 'customCommandsFilePath', 'value': path.join(a, prefs.customCommandsFilePathPackaged) });
  srcFilePaths.push({ 'key': 'customCaptureOptionsFilePath', 'value': path.join(a, prefs.customCaptureOptionsFilePathPackaged) });

  var calFilePaths = [];
  var calFileSrcDir = path.join(a, prefs.customTransducerCalibrationFilesDirectoryPackaged);
  var calFileSubdir = path.basename(calFileSrcDir); // even though this is 'basename' it will grab just the subdir
  fs.readdirSync(calFileSrcDir).forEach( fn => {
    // TODO exclude any .DS_Store
    calFilePaths.push(path.join(calFileSrcDir, fn));
  });

  console.log("srcFilePaths and calFilePaths: (for copying all customizable files to a single directory)");
  console.log(srcFilePaths);
  console.log(calFilePaths);

  //if ( !currentWriteStreamFilepath ) {
  if ( !currentWriteStreamDirectory ) {
    console.log("No directory selected for copy custom control file to ... returning.");
    return;
  }

  currentWriteStreamDirectory = currentWriteStreamDirectory[0]; // it's an array

  //console.log("selected " + currentWriteStreamFilepath + " for copy custom control file to...")
  console.log("selected " + currentWriteStreamDirectory + " for copying customizable files to...")
  //cancelThis = fs.copyFile(srcFilePath, currentWriteStreamFilepath, (err) => {

  // First the top level files
  srcFilePaths.map( fpKvp => {
    var destFp = path.join(currentWriteStreamDirectory, path.basename(fpKvp.value));
    fs.copyFile(fpKvp.value, destFp, (err) => {
      if (err) {
        console.log("error copying the source file" + fpKvp.value + " to the destination file, " + destFp + " for copy custom command control packaged file(s) to local custom dir. " + err);
      } else {
        console.log('Source (packaged) file ' + fpKvp.value + ' was copied to destination directory ... storing path as pref also.');

        //ipcRenderer.send('prefs:set', { 'key' : 'customCommandsFilePath', 'value' : currentWriteStreamFilepath});

        // TODO DRY Yeah we do this manually for now ...
        ipcRenderer.send('prefs:set', { 'key' : fpKvp.key, 'value' : destFp } );

        // And reload into the local copy
        //prefs = ipcRenderer.sendSync('prefs:getPrefs');
      }
    });
  }); // end of map

  // Create the calFileDirectory
  var calFileDstDir = path.join(currentWriteStreamDirectory, calFileSubdir);
  if (!fs.existsSync(calFileDstDir)) {
    fs.mkdirSync(calFileDstDir);
  }

  // Update the pref setting
  ipcRenderer.send('prefs:set', { 'key' : 'customTransducerCalibrationFilesDirectory', 'value' : calFileDstDir } );

  // Now copy any calibration files
  calFilePaths.map( calFp => {

    var destFp = path.join(calFileDstDir, path.basename(calFp));
    fs.copyFile(calFp, destFp, (err) => {
      if (err) {
        console.log("error copying the source file" + calFp + " to the destination file, " + destFp + " for copy custom command control packaged file(s) to local custom dir for cal file. " + err);
      } else {
        console.log("Source (packaged) cal file " + calFp + " was copied to destination directory ... storing path as pref also.");
      }
    }); // end of copyFile

  }); // end of map for calFp

  // And reload into the local copy
  prefs = ipcRenderer.sendSync('prefs:getPrefs');

};
