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

const audioControl = require('./audioControl.js');

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

const audioFdbkEmitter = require('./audioFdbk.js').AudioFdbkEmitter;


const crc32 = require('crc');

const os = require('os');


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
//
// TODO Sample rate: probably want to pull this from HW config and/or see where/if implemented
//
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

//var curChanToGraphSingle = 0;
var curChanToGraphMulti = 0;

const defNumChans = 8;
var numChans = defNumChans;

var prefs;
var customCommandsFilePath;
var customCommandsJson;


let mainWindowMultiWfChartAccordionIsOpen = true; // default






var MainWindowGetNumberOfChannels = function() {

  if ( captureDataFileOutputBatch ) {
    return captureDataFileOutputBatch.NumberOfChannels();
  } else {
    return numChans;
  }

}






var readableStreamBufferGraphCompleteTimeoutId;
var readableStreamBufferGraphIntervalUpdateId;

var resetReadableStream = function(chunkMultiple, chunkSizeBytes) {

  //console.log(`resetReadableStream`);

  //curChanToGraphSingle = 0;
  curChanToGraphMulti = 0;

  let hwNow = getHardwareData(); 

  let wfLenBToUse = hwNow.waveformBytesPerSample * hwNow.waveformLengthSamples; //  defWfLenB;
  
  // if parameter is passed up the wfLenBToUse etc
  // https://stackoverflow.com/questions/11796093/is-there-a-way-to-provide-named-parameters-in-a-function-call-in-javascript
  if ( chunkSizeBytes ) {
    wfLenBToUse = chunkSizeBytes;
  }

  singleChartBuf =  Buffer.alloc(wfLenBToUse, 127);

  singleWfChart.RebuildChart();

  let amsg = `resetReadableStream early: `;
  amsg += ` chunkMultiple: ${chunkMultiple}`;
  amsg += ` gChunkMultiple: ${gChunkMultiple}`;
  amsg += ` wfLenBToUse: ${wfLenBToUse}`;
  console.log(amsg);

  audioFdbk.reset();

  // changing below to 20ms (and doubling the chunksize) doesn't stop the
  // crash malloc errors
  //chunkMultiple = 33; // 33 in our testing gives split between 8 chans, and no buffer overflow
  //chunkMultiple = chunkMultiple || 3; // default to 3x // 
  chunkMultiple = chunkMultiple || gChunkMultiple || 3; // this persists a previously set chunkMultiple

  // TS ***
  // fix to above circa Q2-Q3 2022 has been
  // chunkMultiple = chunkMultiple || gChunkMutiple || 3;
  // </ TS ***

  gChunkMultiple = chunkMultiple;
  
  ourReadableStreamBuffer = new rsb.ReadableStreamBuffer({
    frequency: 10,       // in milliseconds // 5 or 7 was ok // 10 less crashy // less than 7ms to be faster than incoming packets of 4096
    chunkSize: (chunkMultiple*wfLenBToUse), //16380, //(4095)//,     // bytes -- 4096 gives a left-ward walk -- 4095 was generally steady
    initialSize: (100 * 1024),    // was 1000 // added these two for size management due to constant overflow
    //incrementAmount: (10 * 1024)  // zero does nothing - doesn't cap it
  });

  //singleWfChart = null;
  // $('#chart').empty();
  // singleWfChart = new SingleWfDataChart({
  //   parentElementIdName: "chart",
  //   chartBuffer: singleChartBuf,
  //   dataLen: wfLenBToUse
  // });
  // singleChartBuf =  Buffer.alloc(wfLenBToUse, 127);
  // Cuz this might get called on a single WF grab - and this will 
  // create an immediate chart fill of dummy data (TODO - Promise? Await?)
  if ( singleWfChart._chartBuffer.length != wfLenBToUse ) {
    console.log("mainWindow: about to call UpdateChartLengh to " + wfLenBToUse);
    // TODO eventually - this is not actually what we always want 
    // for example
    // ADMN5 FFT buffer might come in at 1024 * 3 * 4 + 16 bytes - 
    // but actually the target length is just 1024 data points
    // which is available in the button options for example
    singleWfChart.UpdateChartLength(wfLenBToUse); 
  }

  let msg = `resetReadableStream late:  `;
  msg += ` chunkMultiple: ${chunkMultiple}`;
  msg += ` gchunkMultiple: ${gChunkMultiple}`;
  msg += ` wfLenBToUse: ${wfLenBToUse}`;
  console.log(msg);

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

      // NOTE TO DEVS:
      // Try changing chunk values in the buttons definition file(s)
      // rather than forcing to a value here - or be aware that this is 
      // or was a primary intended option

      // TODO probably better buffer overflow tracking ...
      // Update this functionality to click to reset instead 
      // in case this was set from somewhere else
      // and don't reset until clicked again
      if ( ourReadableStreamBuffer.size() > (1000*1024) ) {
        console.log(ourReadableStreamBuffer.size());
        $('#btnBufferOverflowing').removeClass('disabled').addClass('orange pulse');
        // TODO DRY - see sprenderer.js dport.on('error'...)
        $('#btnBufferOverflowing').attr("title", "ourReadableStreamBuffer.size buffer backlag detected. Click to Reset.");
        $('#btnBufferOverflowing').click( ()=> {
          $('#btnBufferOverflowing').removeClass('orange pulse').addClass('disabled');
          $('#btnBufferOverflowing').attr("title","");
        });
      } else {
        //$('#btnBufferOverflowing').removeClass('orange pulse').addClass('disabled');
      }

      // Could try to:
      // - Increment the decimation counter here instead and it talks to the sprendered code
      // or
      // - Use 'data' event subscription instead and then use pause and resume to allow
      //   screen plotting to catch up
      while((chunk = ourReadableStreamBuffer.read()) !== null) {

        // TODO UI switch/checkbox to allow debug UI to do enable/disable such
        // functionality
        //console.log(chunk.length);
        // RS8 for chunk.length:
        // DCF with chunk multiple of 8 gives size of 8x4095=32760 in DCF mode
        // while running continuous channel scan for example will give exactly that as the chunk.length
        // in Regular mode channel scan chunk size set to 9 gives actual length: 36855 which is right for 4095
        // in Regular mode single channel 12285 is the length consistently given and matches chunk=3
        // DL0100A1 yes get chunk length of 2500 even when smaller buffers accumulated in cport on data
        // for ch-ch direct obtesting fw and for setup cpaq and grab a wf
        // for chunk size mult 1

        // In DCF-UI 
        // eg RS104 or RS8
        // Start = chunk mult of 8 (captureBufferMultiple button option value)
        // Stop back to chunk mult 1
        // DCF: No single WF chart visible and chunk goes to parsing module for 
        // all-data file writing and decimate Kick graph updating based on extracted
        // channel number
        //
        // In Reg-UI
        // eg RS104 or RS8
        // Single grab: chunkMult: 1 singleBuffer in button description
        // (1C) Single Channel stream: chunkMult: 3 (mult)
        // (CS) ChanScan stream: chunkMult: 9 (mult)
        // In Reg-UI currently:
        // 1C: only the 1st WF length is retained and plotted on the singleWF graph
        //     the other 2 WF lengths get lost
        // CS: only the 1st WF length is retained and the remaining 8 WFs are thus discarded 
        //     so in perfect data transmission you advance 1 WF graph every chan sweep 

        // The channel to graph in the single waveform chart
        // NEXT: Move to UI for single-channel focused selection
        // Base 0
        var selectedChanToGraph = 0;

        // OKDO is this update to wfLenBToUse now the correct var to put here? yes
        // OKDO after the partial copy - how much chunk and/or readable buffer is left?
        // VFYD: indeed the chunk is the whole amount of the mult * wflen and is all pulled 
        // from the stream - so the uncopied portion goes away unless the whole chunk 
        // is used elsehow down there
        chunk.copy(singleChartBuf, 0, 0, wfLenBToUse + 1); // was defWfLenB + 1


        // This was for quick live demo updated functionality
        // If the chunk multiple was larger, then we were probably decimating
        // the data and wanting to just graph some interval of a single channel
        // Really this is or could be:
        // if ( prefs.interface !== 'dataCaptureFocused' ) or similar like:
        // gChunkMultiple > 3 used to target like chan scan in RegUI
        // and then for showing just one selected chan in the single WF chart
        // Currently this (below) only triggers once for cont chan scan for the RS8
        // and then curChanToGraphSingle just keeps incrementing ...
        // TODO we'll disable this until some intended logic is reconstructed
        // if ( gChunkMultiple > 3 && selectedChanToGraph == curChanToGraphSingle ) {
        //   singleWfChart.UpdateChartBuffer(singleChartBuf);
        //   //audioFdbk.playData(singleChartBuf); // TODO this creates another play on top of below multiWfs
        // }

        // Versus:
        // for smaller chunks, assume this is more of a single channel
        // scan or snapshot and that the chunk size does the decimation
        // sufficiently and we don't care about trying to always grab and
        // chart the same channel
        // Currently this triggers for RS8:
        // single chan single acquire 
        // single chan stream
        //if ( gChunkMultiple < 4 ) {
        // so let's update this to the new below because we are moving to proper implementation 
        // based on chart destination and the chunking does it's own thing 
        // ie in RegUI just the first chunk is grabbed

        // Now not just 'chart' but maybe like 'chart-admn5-fft-bin'
        //if ( prefs.interface !== 'dataCaptureFocused' && gReturnDataTo.indexOf('chart') > -1 ){ 
        
        if ( prefs.interface !== 'dataCaptureFocused' ) {

          switch ( gReturnDataTo ) {

            case 'chart-admn5-fft-bin':
              if ( readableStreamBufferGraphCompleteTimeoutId ) {
                clearTimeout(readableStreamBufferGraphCompleteTimeoutId);
                readableStreamBufferGraphCompleteTimeoutId = null;
                clearTimeout(readableStreamBufferGraphIntervalUpdateId);
                readableStreamBufferGraphIntervalUpdateId = null;
              }
              // Either here or outside of this - accumulate / parse the FFT data for chart 
              // freq x mag norm to 1
              // 32-bit floats in 3x sets
              // bindex, freq, mag (norm to 1)
              // https://stackoverflow.com/questions/40970739/how-to-convert-two-16bit-integer-high-word-low-word-into-32bit-float/40970862#40970862
              // https://stackoverflow.com/questions/42699162/javascript-convert-array-of-4-bytes-into-a-float-value-from-modbustcp-read
              var v = new DataView(chunk.buffer);
              var offs = 16; // First 16 bytes are the message about like received well yeah 
              // or could do like find first index of 0x0d for the end of that ascii msg like:
              // var offs = chunk.indexOf(0x0d) // 15 returned at this time
              var destInd = 0;
              var mag = 0.0;
              var NaNMagFlag = false;
              // In early testing we used format of 3 floats per data point
              // Now it is just 2, the freq and normalized magnitude
              //while ( destInd*12+12+offs < chunk.length ) {
              while ( destInd*8+8+offs < chunk.length ) {
                // See IEEE-754 Float format for NaN (like when /0.0 or when FFT has no data 
                // yet and a waveform needs to be acquired first
                // Then data coming in for the magniture looks like:
                // chunk[off+12*1+8 ... 11] = [ ... 0x00 0x00 0xc0 0x7f ... ] or [0 0 192 127]
                // which as little endian is 0x7f c0 00 00 which is actually NaN 
                // see: https://www.h-schmidt.net/FloatConverter/IEEE754.html for example
                // float sets like [ binIndex, freq, magNormd ]
                // update: float sets like [ freq, magNormd ]
                //admn5ParsedBufX[destInd] = v.getFloat32(offs + destInd*12 + 4, true); // true = little endian - it matters
                admn5ParsedBufX[destInd] = v.getFloat32(offs + destInd*8, true); 
                //mag = v.getFloat32(offs + 12*destInd + 8, true);
                mag = v.getFloat32(offs + 8*destInd + 4, true);
                if ( isNaN(mag) ) {
                  mag = 0.0;
                  NaNMagFlag = true;
                }
                admn5ParsedBufY[destInd] = mag;
                destInd++;
                // 20, 24, skip, 32, 36, skip, 44, 48
                // (skip 0), 4, 8     dest: 0th bin
                // (skip 12), 16, 20  dest: 1st bin
                // (skip 24), 28, 32  dest: 2nd bin
                // (skip 12*dest), 12*dest+4, 12*dest+8
              } // end of while ( parsing chunk.length )
              singleWfChart.UpdateChartBufferFloat32(admn5ParsedBufX, admn5ParsedBufY);
              if ( NaNMagFlag ) {
                console.warn(`Warning: At least one magnitude was converted to float32 as NaN. Maybe you need to initialize the WF first and then retreive the FFT?`);
              }
              // Verify CRC if present
              // 32-bit 0xqqqq nnnn
              // TODO and framework button option or etc to check this 
              // or accessory specific etc - 
              // FFT bin now should come back with a CRC32 as the last 4 bytes
              break;

            case 'chart':
            default:
              singleWfChart.UpdateChartBuffer(singleChartBuf);
              audioFdbk.playData(singleChartBuf);
              ;

          } // switch gReturnDataTo

        } // end of prefs.interface !== dataCaptureFocused



        // Sure, for now, basic testing, each chunk, whatever multiple, each
        // time we're here, just increment the channel number,
        // assuming that the multiple of chunk is set to intentionally
        // account for cycling through channels or the interaction is known
        // and correspondingly accounted for / set up
        // TODO need to wrap check and reset if going to implement this
        //curChanToGraphSingle += 1;



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

          // Now in DCF UI audio play happens in the decimateKick UI graph update function
          // <TESTING>
          //  audioFdbk.playData(chunk);
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

        } else { // prefs.interface is not DCF:

          // If we're not parsing waveforms (which at the moment, is only done
          // in the capture data file output batch module) then just dump to
          // waveform charts

          // TODO - better way
          // HDL: for non-DCF (DCF uses different button defs and whole chunks go for processing)
          // gChunk = 1 or 3 for single grab or single channel stream 
          // gChunk = 9 for chan scan streaming
          // Eventually we use the embedded channel data!
          // Trying add the gReturnDataTo - now we can clean up the gChunk stuff:
          //if ( gChunkMultiple > 3 || gReturnDataTo === "multiChart" ) {
          if ( gReturnDataTo === 'multiChart') {

            // wrap the counter over if needed
            curChanToGraphMulti = curChanToGraphMulti == numChans ? 0 : curChanToGraphMulti;
            
            // TODO if this section is open then update only?
            if ( mainWindowMultiWfChartAccordionIsOpen ) {
              multiWfs[curChanToGraphMulti].UpdateChartBuffer(singleChartBuf);
              // TODO round-robbin the audio below:
              //audioFdbk.playData(singleChartBuf);
              audioFdbk.roundRobbinPlayData(curChanToGraphMulti+1, singleChartBuf);
            }
              
            // And if multiWFsWindow is open - send to data to it 
            // really, at the moment, just send it, main will figure out what to do 
            // TODO this is for non-DCF right now only 
            // for DCF graph updates see the decimateKick thing section
            // audio is handled by the popout itself probably with another round robbin call
            ipcRenderer.send('multiWfsWindow:update', {
              "chartToUpdateIndex": curChanToGraphMulti, 
              "buf" : singleChartBuf
            });

            curChanToGraphMulti++;

          } // if gReturnDataTo multiChart

        } // if prefs.interface is not DCF (ie it is regular)

        // PLACEHOLDER 
        // if one wants to run DL0100A1 (non DCF UI view) through any plugins,
        // then the plugin-calling capture-data.js code section might want to go here 
        // conditionally on hardware ID perhaps so streaming boards don't call it multiple times

      }

    } catch (e) {
      console.error("Error in readable event: " + e);
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
// RS8 31 puts in a weird chan order for graph and every-other round robbin audio updates 
// but 33 does correct order (as would be expected for an 8 chan system)
var decimateKick = 33; //31; //121; //61; seems sustainable for RS8 long term //31; for RS104 Long acquisitions (?)    // was 15 // TODO this will become either UI item or pref probably better
var MainWindowUpdateChart = function ( channelNumber, buf ) {

  // From DCF...
  // Typically called from capture-data.js from parseInBufferForWaveforms...
  // TODO need to consolidate the display update thing
  // because in non-DCF charts updates happen from within the readable stream on chunk readable

  // Decimate the data so we don't overwhelm the system...
  // Testing temporary with a simple multiple of total calls decimation
  decimate += 1;

  if ( decimate == decimateKick ) {

    decimate = 0;

    //let tfBuf = transformWf(buf);

    if ( mainWindowMultiWfChartAccordionIsOpen ) {
      //console.log('mainWindowMultiWfChartAccordionIsOpen ... updating it');
      multiWfs[channelNumber - 1].UpdateChartBuffer(buf); // graph TF buf
      // TODO if use audio feedback ... ?
      // this is for DCF UI only
      //audioFdbk.playData(buf);
      audioFdbk.roundRobbinPlayData(channelNumber, buf); // play audio buf
    }


    // For if a popout open for multiWFs
    ipcRenderer.send('multiWfsWindow:update', {
      "chartToUpdateIndex": channelNumber - 1, 
      "buf" : buf
    });

  }  

}

// TS -- 7ceee74 buffer / chunk data (no O/F)
// Buffer 4095 incl ourReadableStreamBuffer
// Buffer 2500 



var transformWf = function (buf) {
  let i = 0;
  buf.forEach( function(v, i, buf) {
    buf[i] = Math.abs(v - 128) * 2;
  });
  return buf;
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

function storeUserCollapsibleState(liEle) {

  // For static div containers and their dynamic elements, 
  // the on click event is set up in $(document).ready()

  // liEle is typically the <ul class="collapsible..." />
  // if this is called like: 
  // $('#controlPortButtonsFromFileDiv').on('click', '.collapsible', function() {
  //  storeUserCollapsibleState(this); // this => liEle in the target function 
  //});
  // or like:
  // $('#singleWaveformChartAccordion.collapsible').on('click', '', function() {
  //   storeUserCollapsibleState(this); // this => liEle in the target function 
  //   will be like <ul class="collapsible collapsible-accordion">...</ul>
  //
  // But if called like 
  // $('#div').collapsible({
  //  onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
  //  onCloseEnd: the same
  //})
  // then ele is the li that gets the active or not active 
  // so we can map this to the parent ul and rework it 
  if ( liEle.tagName === "LI" ) {
    liEle = liEle.parentElement;
  } 

  var collapsed = true;
  var collapsedBodyDivName = "";

  if ( $(liEle).find('li')[0].className.indexOf('active') > -1 ) { collapsed = false; }

  collapsedBodyDivName = $(liEle).find('div.collapsible-body').attr('id');

  if ( !collapsedBodyDivName ) {
    console.warn(`Could not get a collapsible-body div id for this clicked collapsible ${liEle.outerHTML.slice(0,60)}... (truncated at 60 chars) \r\n Nothing to store`);
    return;
  }

  var pcc = prefs.collapsedCollapsibles;
  var poc = prefs.openedCollapsibles;
  if ( !pcc ) { pcc = []; }
  if ( !poc ) { poc = []; }

  console.log(`stored collapsed: ${pcc}`);
  console.log(`stored uncollapsed: ${poc}`);

  if ( collapsed && (collapsedBodyDivName.length > 0) ) {
    if ( !pcc.includes(collapsedBodyDivName) ) {
      pcc.push(collapsedBodyDivName)
    }
    // Remove from the opened array
    if ( poc.includes(collapsedBodyDivName) ) {
      poc.splice(poc.indexOf(collapsedBodyDivName), 1);
    }
  }
  if ( !collapsed && (collapsedBodyDivName.length > 0) ) {
    if ( !poc.includes(collapsedBodyDivName) ) {
      poc.push(collapsedBodyDivName)
    }
    // Remove from the collapsed array
    if ( pcc.includes(collapsedBodyDivName) ) {
      pcc.splice(poc.indexOf(collapsedBodyDivName), 1);
    }
  }

  console.log(`stored collapsed: ${pcc}`);
  console.log(`stored uncollapsed: ${poc}`);

  setKeyAndReloadPrefs('collapsedCollapsibles', pcc);
  setKeyAndReloadPrefs('openedCollapsibles', poc);

  console.log(prefs);

} // end of storeUserCollapsibleState




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
    
    // For popout window, item below is handled directly in the message receiver 
    // TODO is that in duplicate?
    multiWfStartRenders(numChans);
    // if ( gReturnDataTo === "multiChart") {
    //   var i = 0;
    //   for ( i = 0 ; i < numChans ; i++ ) {
    //     multiWfs[i].RenderChart();
    //   }
    // }

    // Update the UI status indicator showing Graph/Data Listening

    animStarted = true;

  } else {
    console.log("mainWindowUpdateChartData: animStarted = true, calling cancelRenderChart()");
    singleWfChart.CancelRenderChart();
    
    // TODO 0.0.18 need to implement popout stop renders too and or VFY????
    multiWfStopRenders(numChans);

    ipcRenderer.send('multiWfsWindow:cancelRenders', {
      "numChans": numChans
    });

    // if ( gReturnDataTo === "multiChart") {
    //   var i = 0;
    //   for ( i = 0 ; i < numChans ; i++ ) {
    //     multiWfs[i].CancelRenderChart();
    //   }
    // }

    // Update the UI status indicator showing Graph/Data Not Listening

    animStarted = false;

  }
}


let multiWfStartRenders = (numChans) => {
  //if ( animStarted ) { return; }
  if ( gReturnDataTo === "multiChart") {
    var i = 0;
    for ( i = 0 ; i < numChans ; i++ ) {
      multiWfs[i].RenderChart();
    }
  }
  animStarted = true;
}

let multiWfStopRenders = (numChans) => {
  if ( !animStarted ) { return; }
  if ( gReturnDataTo === "multiChart") {
    var i = 0;
    for ( i = 0 ; i < numChans ; i++ ) {
      multiWfs[i].CancelRenderChart();
    }
  }
  animStarted = false;
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
function getHardwareData() {
  return sprend.getHardwareData();
}

// Bluetooth testing - force open by passing a port path String
function openControlPort(portPath) {
  return sprend.openControlPort(portPath);
}




// Chart / graphing / data view items - Single
var singleWfChart; /* = new SingleWfDataChart({
  parentElementIdName: "chart",
  chartBuffer: singleChartBuf
});*/ // need to re-assign after DOM load to catch the right DOM ele (chart)


var admn5ParsedBufX;
var admn5ParsedBufY;





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
  var files = fs.readdirSync(path.join(__dirname,'css/'));
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





  // Set window title to include software version and/or etc?
  $(document.getElementsByTagName('head')[0]).find("title").text("DacqMan " + electron.remote.app.getVersion());
  


  // https://stackoverflow.com/questions/9484295/jquery-click-not-working-for-dynamically-created-items
  // for dynamically create items we need to use .on method on a static base thing
  $('#multiWfsWindowPopout').click( function () {

    console.log("popout clicked");
    let w = window.outerWidth; // innerWidth subtracts the devTools window width if open 
    let h = window.innerHeight; // for height, outer - inner = top window handle height
    let offset = window.outerHeight - window.innerHeight;
    w = w - offset;
    let x = window.x + 4*offset;
    let y = window.y + 2*offset;

    // available:
    // multiWfs.length 
    // numChans 
    // Get current classes applied:
    //   $('multiWaveformChartAccordion').find('.row > div').attr('class') // eg col s12
    // Applied per chart class for the 4x is eg col s12 m6
    //   $('#divMultichart > div').length // is the number of charts eg 4 for RS104
    //   $('#divMultichart > div').attr('class') // eg col s12 m6 l4 for 4x @RS104
    let numChansToSetup = numChans; 
    if ( numChansToSetup != $('#divMultichart > div').length ) {
      console.warn(`numChans does not equal number of charts in the multichart area`);
    }
    let chartClasses = $('#divMultichart > div').attr('class') || 'col s12 m6 l4';

    // HOOKALERT04
    ipcRenderer.send('createMultiWfsWindow', {
      "height": h,
      "width": w,
      "x": x,
      "y": y,
      "numChans": numChansToSetup, // may be default or updated to eg 4 from DCF UI
      "chartDivClasses": chartClasses,
      "animStarted": animStarted
    });
    // TODO here maybe - we need to ... trigger something that for eg a 
    // DCF view will update the # chans and graph handles for eg the 
    // 4 channels 
    // Like would happen if this were already open when DCF START happened
    // Like need the captureDataNumberOfChannelsSet this.maxChannelNum from capture-data.js 
    // and calling SetupMultipaneCharts but with the correct number of chans 
    // Or if running maybe ask if the chan nums has been updated and stored elsewhere?

    M.Collapsible.getInstance($('#multiWaveformChartAccordion.collapsible')).close();
    // OKDO reverse this on window close - 
    // OKDO also need a way to deactivate the updating of these graphs maybe with a 
    // sign that says (see popout) ???
  });

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
        tivText = "Do not restore text input values" :
        tivText = "Restore text input values";
      $('#aToggleTextInputValues').text(tivText);
      // HOOKALERT03 may want to select based on stored value for slide/txt in prefs.customControlSettingsJson
      showCustomControlsAsRangeSliders(useRangeSliders, customCommandsJson); //true, customCommandsJson);
      $('.collapsible').collapsible({
        accordion: true
      });

      // TODO shall we combine below into modular?
      //audioFdbk.SetSoundMutedState(prefs.soundMutedState);
      audioControl.SetMuteStateFromPrefs(prefs, $('#sound-control > img.mute-unmute'));

      // For remembering collapsible states (selected items only)
      // Ok so now these fire at the end of the open/close -- but not just for user clicks!!!
      // $('#singleWaveformChartAccordion').collapsible({
      //   onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
      //   onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      // });
      // $('#controlPortButtonsFromFileDiv').find('.collapsible').collapsible({
      //   onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
      //   onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      // });
      //
      // NOPE:
      // $('#singleWaveformChartAccordion.collapsible').on('click', '', function() {
      //   $(this).collapsible({
      //     onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
      //     onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      //   });
      //   //storeUserCollapsibleState(this); // this => liEle in the target function 
      //   // will be like <ul class="collapsible collapsible-accordion">...</ul>
      // }); // indeed this may fire before collapsing has happened, so yes, we need to find 
      // $('#controlPortButtonsFromFileDiv').on('click', '.collapsible', function() {
      //   $(this).collapsible({
      //     onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
      //     onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      //   });
      //   //storeUserCollapsibleState(this); // this => liEle in the target function 
      //   // will be like <ul class="collapsible collapsible-accordion">...</ul>
      // });


      YourFace.Load(prefs.interface, prefs.interfaceRefinement, customCommandsJson.uiDataCaptureFocused);
      if ( prefs.boolUsePlugins ) {
        plugins = require('./plugins.js');
      } else {
        console.warn("prefs.boolUsePlugins = false; Skipping require (and load) plugins.");
      }
      restoreCollapsibleStates(prefs);

      // Selected collapsibles, remember collapsible states
      $('#singleWaveformChartAccordion').collapsible({
        onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
        onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      });
      $('#controlPortButtonsFromFileDiv').find('.collapsible').collapsible({
        onOpenEnd: function(ele) { storeUserCollapsibleState(ele); },
        onCloseEnd: function(ele) { storeUserCollapsibleState(ele); }
      });

      // For a little speed (hopefully?) store the state of the collapsible 
      // for multigraphs chart updates so not query needed each time?
      $('#multiWaveformChartAccordion.collapsible').collapsible({
        onOpenEnd: function(ele) { mainWindowMultiWfChartAccordionIsOpen = true; },
        onCloseEnd: function(ele) { mainWindowMultiWfChartAccordionIsOpen = false; }
      });

      return;
    })
    .catch ( e => {
      console.error("Error loading prefs and customCommandsJson from file: " + JSON.stringify(e));
      console.error(e);
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

  // TODO extract the urls and texts
  // TODO extract the setting / changing img functions / strings
  $('#sound-control').click( function(e) {
    audioControl.onSoundControlClick(e);
  });
  //$('#sound-control').click( function(e) {
  //   // b.target should be an img tag within the clicked span#sound-control
  //   let isUnmuted = e.target.src.includes("unmuted");
  //   // if isUnmuted, go to muted and swap the img 
  //   if ( isUnmuted ) {
  //     // 1. update pref 
  //     ipcRenderer.send('prefs:set', {
  //        'key': 'soundMutedState', 'value': 'muted'
  //     });
  //     // 2. swap the icon 
  //     e.target.src = "./assets/icon-muted-audio-50-wh.png";
  //     e.target.alt = "No Audio (Muted)";
  //     // 3. update the global or big WF graph or whatever and/or the audioFdbk module
  //     audioFdbk.SetSoundMutedState('muted');
  //   } else {
  //     ipcRenderer.send('prefs:set', {
  //       'key': 'soundMutedState', 'value': 'unmuted'
  //     });
  //     e.target.src = "./assets/icon-unmuted-audio-50-wh.png";
  //     e.target.alt = "Audio (Unmuted)";
  //     audioFdbk.SetSoundMutedState('unmuted');
  //   }
  // });



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




  setTimeout(function(){
    audioFdbk.playOpen();
  }, 1000);


  // Add clicks to divs etc elements statically in the html template that should 
  // trigger tracking of user-clicked open/close status for collapsibles, etc.
  // Oh right - only the #controlPortButtonsFromFileDiv is static - so we need to  
  // use the .on('click', '> li > a.collapsible-header', function () {}) syntax
  // a.collapsible-header is the specific clickable header whereas
  // .collapsible will get the ul.collapsible.collapsible-accordion which can be 
  // plugged into like M.Collapsible.getInstance(ele)
  //$('#controlPortButtonsFromFileDiv').on('click', 'a.collapsible-header', function() {

  // $('#controlPortButtonsFromFileDiv').on('click', '.collapsible', function() {
  //   storeUserCollapsibleState(this); // this => liEle in the target function 
  //   // will be like <ul class="collapsible collapsible-accordion">...</ul>
  // });

  // This sort of call is no go:
  // $('#controlPortButtonsFromFileDiv').on('click', '.collapsible', function() {
  //   $(this).collapsible({
  //     onOpenEnd: storeUserCollapsibleState(this) // 
  //   });
  // });
  // $('#singleWaveformChartAccordion.collapsible').on('click', '', function() {
  //   storeUserCollapsibleState(this); // this => liEle in the target function 
  //   // will be like <ul class="collapsible collapsible-accordion">...</ul>
  // }); // indeed this may fire before collapsing has happened, so yes, we need to find 
  // a way to set a function for onOpenEnd and onCloseEnd
  
  // $('#singleWaveformChartAccordion').collapsible({
  //   onOpen: function(ele) { storeUserCollapsibleState(ele); },
  //   onClose: function(ele) { storeUserCollapsibleState(ele); }
  // });


  // Testing auto cal visa
  //require('./autocal.js');


  // Testing - piecewise customer cal examples 
  // setTimeout(() => {
  //   singleWfChart.DcCurrentCal(); // or AcCurrentCal(); 
  // }, 2000);



  // Check platform and/or endianness -- this may matter for the implementation 
  // of CRC
  if (os.endianness() !== "LE" ) {
    console.warn(`OS is not little endian. Please notify developer. CRC checks for some 
    accessories may not work for example.`);
  } else {
    console.log(`OS is LE (little endian)`);
  }



  //
  // < TEST CRC >
  //
  // Testing a CRC 
  // ADMN5 uses the stm32 CRC32 hardware which uses the MPEG2 style 
  // which is included in the npm i crc package apparently 
  let crcTestDat = new Uint32Array([
    0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,
    0x08,0x09,0x10,0x11,0x12,0x13,0x14,0x15,
    0x16,0x17,0x18,0x19,0x20,0x21,0x22,0x23,
    0x24,0x25,0x26,0x27,0x28,0x29,0x30,0x31,
    0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39
  ]);

  // CAUTION: Later npm modules apparently have the crc32mpeg2 as a renamed function
  // but right now at this version apparently we access this as crc32mpeg only
  // The version that the crccalc website comes up with for byte only representation 
  // matches and is: 1391950b
  // However we will need to match the 32-bit variant
  let crcRes = crc32.crc32mpeg((crcTestDat));    //.crc32mpeg2(Buffer.from(crcTestDat));
  console.log(`Startup dev test crc32 on byte array: 0x${crcRes.toString(16)}`);
  
  // let rrr = crc32.crc32mpeg(new Uint32Array(crcTestDat[0]));
  // for ( let iii = 1; iii < 40; iii++ ) {
  //   rrr = crc32.crc32mpeg(new Uint32Array(crcTestDat[iii]), rrr);
  // }
  // console.log(`Startup dev test crc32 on byte array 2nd attempt: 0x${rrr.toString(16)}`);

  // crc32.crc32mpeg(new Uint8Array(crcTestDat.buffer)).toString(16)
  // "901a20c2"
  // but endian ness on macos at least here is like 0x01 => 01 00 00 00 
  // which is backwards from how it seems that the stm32 or the crccalc is processing it

  // And endianness by default may be platform dependent, so we need alas to use like 
  // a dataview to guarantee read and byte order ?

  // This seems to work and illustrate things:
  // Buffer(crcTestDat.buffer).writeUInt32BE(Buffer(crcTestDat.buffer).readUInt32LE(8), 8)
  // This does for example change the crcTestDat.buffer to:
  // [ 0 0 0 0   1 0 0 0    0 0 0 2   3 ....]

  // So it would seem the stm32 is processing as 4 bytes and is big endian like 0x01
  // becomes 0x00 0x00 0x00 0x01 and so does the crccalc page
  // Whereas the representation here by default as defined in the init for crcTestDat 
  // is little endian (as appropriate for this platform)

  Buffer(crcTestDat.buffer).swap32(); // "swaps in place - see nodejs docs"
  //crcRes = crc32.crc32mpeg(crcTestDat); // Doesn't match expected 
  crcRes = crc32.crc32mpeg(crcTestDat.buffer); // however does match f1beef64
  console.log(`Startup dev test crc32 on byte array, after swap32: 0x${crcRes.toString(16)}`);


  //
  // </ TEST CRC >
  //





  // < TESTING BLUETOOTH PORT >
  /*
  setTimeout( function() {

    console.log( "Testing Bluetooth Port...");
    var h = `<button id="serialPortGoButton" class="waves-effect waves-light btn-large" onclick="beginSerialComms(this)"><i class="material-icons left">device_hub</i>Connect to Ports and Begin Listening for Data</button>`;
    $('#ports_go_button').html(h).removeClass('hide');
    // port hash
    // {"serialNumber":"DA01LO9T","locationId":"5140","description":"FT231X USB UART"
    // make it now:
    // sprenderer.js line ~ 1219:
    // comName / path is chosen as: eg. /dev/tty.usbserial-DA01LO9T
    // sprenderer.js: line 1810 ish 
    // but:
    // beginSerialComms(button)
    // openDataPortThatIsChecked();
    // setTimeout on openControlPortThatIsChecked
    // 
    // openControlPortThatIsChecked => 
    //   controlPortHash = checkboxToPortHash()
    //      => openControlPort(portHash)
    //            comName = getVcpPortNameFromPortInfoHash(portHash)
    sprend.setHardwareByFullname("DL-Series-by-Bluetooth");
    openControlPort("/dev/tty.UltraCouponDataLogger-D"); // if pass string, forces this as comName
    //       

  }, 3000);
  */
   
  //  
  // </ TESTING BLUETOOTH PORT >

}); // end of $(document).ready(...{...})
// END OF DOCUMENT.READY(...)




var calcCrc32Mpeg2 = function( byteBuffer ) { // aka chunk as used above is a Buffer

  let datForCrc = new Uint32Array(byteBuffer); // will have same number of eles as byteBuffer

  // Warning: depends on endianness of platform ??? maybe
  // OS like Linux *nix may be an issue?
  // change from little endian to big endian to match stm32 crc32
  Buffer(datForCrc.buffer).swap32(); 

  let crcRes = crc32.crc32mpeg(datForCrc.buffer);

  return crcRes; // .toString(16) ???

} // end of checkCrc32Mpeg2



var restoreCollapsibleStates = function(_prefs) {

  if ( !_prefs ) { return; }

  var pcc = prefs.collapsedCollapsibles;
  var poc = prefs.openedCollapsibles;
  if ( !pcc ) { pcc = []; }
  if ( !poc ) { poc = []; }

  pcc.forEach ( function (c, i) {
    // div is for the collapsible-body 
    // and its parent is the li (with active or not as a class name)
    // and the parent of that is the ul with the .collapsible 
    // which can be supplied to the M.Collapsible.getInstance for example
    var theUl = $(`#${c}`).parent().parent()[0];
    if ( !M.Collapsible.getInstance(theUl) ) {
      console.warn(`${c} div id name parent parent [0] for collapsible state restore is not a collapsible in this view`);
    }
    if ( theUl && M.Collapsible.getInstance(theUl) ) {
      M.Collapsible.getInstance(theUl).close();
    }
  });
  poc.forEach ( function (c, i) {
    var theUl = $(`#${c}`).parent().parent()[0];
    if ( !M.Collapsible.getInstance(theUl) ) {
      console.warn(`${c} div id name parent parent [0] for collapsible state restore is not a collapsible in this view`);
    }
    if ( theUl && M.Collapsible.getInstance(theUl) ) {
      // Some UI formats might not have the collapsible 
      // implemented the same way - so check that UL is a collapsible
      M.Collapsible.getInstance(theUl).open();
    }
    
  });



} // end of restoreCollapsibleStates





var SetupMultipaneCharts = function( nChans, chartDivClasses ) {
  // mainWindows.js version only
  numChans = nChans;
  var dname = 'divMultichart';
  var d = $(`#${dname}`); //$('#divMultichart');
  d.empty();
  setupMultipaneCharts(d, nChans, chartDivClasses);
  ipcRenderer.send('multiWfsWindow:setup', {
    "parentEle": dname,
    "nChans": nChans,
    "chartDivClasses": chartDivClasses
  });
  let mwfIsOpen = ipcRenderer.sendSync('multiWfsWindow:getIsOpen');
  if ( !mwfIsOpen ) {
    $('#multiWaveformChartAccordion').collapsible("open");
  }
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
  var dumpb = $(document.createElement("button"))
  .addClass("cancel")
  .click( function() {
    console.log($('#cmdOutput').text());
  })
  .append($.parseHTML('<i class="small material-icons">archive</i>'))
  ;
  var dbtn = $(document.createElement("div"))
    .addClass("col s2")
    ;
  dbtn.append(cancelb);
  dbtn.append(dumpb);
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

  if ( !textInputs || textInputs.length < 1 ) {
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






//
//
//
// ipcRenderer handled messages more .... ???
//
//
//


// ipcRenderer.on('multiWfsWindow:update', function(e, data) {
//   console.log('mwf update');
//   multiWfStartRenders(8); //MainWindowGetNumberOfChannels()); // TODO move to a setup function 
//   multiWfs[data.chartToUpdateIndex].UpdateChartBuffer(data.buf);
// });


ipcRenderer.on('multiWaveformChartAccordion:open', function(e, data) {
  console.log('mwf accordion in mainWindow => open');
  // TODO log the updated state of open? or is this captured and handled?
  //multiWfStartRenders(8); //MainWindowGetNumberOfChannels()); // TODO move to a setup function 
  //multiWfs[data.chartToUpdateIndex].UpdateChartBuffer(data.buf);
  M.Collapsible.getInstance($('#multiWaveformChartAccordion.collapsible')).open();
  // get latest prefs and resync up any change in audio mute or sound control state
  getPrefsPromise()
    .then( (prefs) => { // TODO WTF not on back to opened collapsible this recalls state from popout?
      // TODO shall we combine below into modular?
      //audioFdbk.SetSoundMutedState(prefs.soundMutedState);
      audioControl.SetMuteStateFromPrefs(prefs, $('#sound-control > img.mute-unmute'));
    });
  
});

// ipcRenderer.on('multiWfsWindow:created', (data) => {
//   console.log("received multiWfsWindowCreated event via ipcRenderer");
  
// });

audioFdbkEmitter.on('audioFdbk:playingSoundForChanNum', function(data){
  if ( multiWfs && multiWfs[data.chanNum - 1]) {
    multiWfs[data.chanNum - 1].ShowPlayingSound(data.timeoutMs);
  }
});