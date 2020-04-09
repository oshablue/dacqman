// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const SerialPort = require('serialport')

// parser requires a newer serialport, like 7.x.x
// whereas we were using and specifying 6.1.0 initially
// as this built and installed ok with other dependencies, but does not yet
// include parsers
//const Delimiter = require('@serialport/parser-delimiter')

const createTable = require('data-table')
var port; // old / vcp app only
var dport  // the data port
var device //
var cport // control port

const Ftdi = require('ftdi');

// For debugging
//var util = require('util');



const electron = require('electron');
const {ipcRenderer} = electron;

// TODO I don't think this is right
const { dialog } = require('electron').remote;

const fs = require('fs');

//const CaptureDataFileOutput = require('./capture-data.js');
const { CaptureDataFileOutput : CaptureDataFileOutput } = require('./capture-data.js');


var buf = []; // new Uint8Array; //[];
var nsamp = 4096;
var filling = false;
var samples = 0;
var tstart = 0;
var tstop = 0;
var time;




// TODO -- static --> and then --> callback structure for correct data destination


SerialPort.list((err, ports) => {
  console.log('ports', ports);
  if (err) {
    document.getElementById('vcp_error').textContent = err.message
    return
  } else {
    document.getElementById('vcp_error').textContent = 'No VCP errors, so far.'
  }

  if (ports.length === 0) {
    document.getElementById('vcp_error').textContent = 'No serial ports discovered'
  }

  var headers = Object.keys(ports[0])
  headers.push("selectthisone")
  const table = createTable(headers)
  tableHTML = ''
  table.on('data', data => tableHTML += data)
  table.on('end', () => document.getElementById('vcp_ports').innerHTML = tableHTML)
  ports.forEach(function(port){
    var p = {}
    Object.keys(port).forEach(function eachKey(key) {
      p[key] = port[key]
    })
    p.selectthisone = "<button id=\"b1\" name=\"" + port["comName"] + "\" onclick=\"serialSelect(this)\">selectme</button>"
    table.write(p)
  })
  table.end();
})






// List devices via D2XX FTDI (node ftdi)
Ftdi.find( function(err, devices) {
  console.log(devices.length + " FTDI (D2XX) Devices Found.");
  if (err) {
    document.getElementById('ftdi_error').textContent = err.message
    //return
  } else {
    document.getElementById('ftdi_error').textContent = 'No FTDI errors, so far.'
  }
  if (devices.length === 0) {
    document.getElementById('ftdi_error').innerText = 'No FTDI ports (via non-VCP) found.'
  }

  var headers;
  if ( devices.length > 0 ) {
    var fd = new Ftdi.FtdiDevice(devices[0]);
    headers = Object.keys(fd.deviceSettings);
  } else {
    headers = Object.keys(new Ftdi.FtdiDevice({ locationId: 0, serialNumber: 0}).deviceSettings);
  }
  headers.push("UseForData");
  headers.push("UseForControl");
  table = createTable(headers);
  tableHTML = ''
  table.on('data', data => tableHTML += data)
  table.on('end', () => document.getElementById('ftdi_ports').innerHTML = tableHTML)

  // Now see if we can set some defaults
  // If two consecutive FTDI devices have serialNumber the same, except first is A and 2nd is B in last digit
  // and vendor and product ID are the same - then A is Data and B is control
  // If we see this once, then stop.
  // If there is a 2nd occurence, leave it to the user to correct this, in the event
  // there are two similar devices connected to the PC
  // TODO we are assuming sort order gives ports as A then B
  // To sort on Keys, see:
  // https://stackoverflow.com/questions/16648076/sort-array-on-key-value
  var i;
  devices.forEach( function(d) {
    d["UseForDataChecked"] = '';
    d["UseForControlChecked"] = '';
  });
  for ( i = 0; i < devices.length; i++) {
    if ( i + 1 >= devices.length ) {
      break;
    }
    var d1 = devices[i];
    var d2 = devices[i+1];
    var sn1 = d1["serialNumber"];
    var sn2 = d2["serialNumber"];
    console.log("FTDI sn1: " + sn1);
    console.log("FTDI sn2: " + sn2);
    if ( d1["vendorId"] === d2["vendorId"] && d1["productId"] === d2["productId"] ) {
      console.log("Same device vendorId and productId");
      if ( sn1.substr(0, sn1.length - 2) === sn2.substr(0, sn2.length - 2) ) {
        console.log("Same device serial number base");
        if ( sn1.substr(sn1.length - 1, 1) === 'A' && sn2.substr(sn2.length - 1, 1) === 'B' ) {
          console.log("Devices have correct A/B sequence for suffixes");
          // DOM isn't ready yet if we place after table generation
          // and then use ID selectors in jquery - there are ways around this
          // for now, this if faster in dev
          devices[i].UseForDataChecked = "checked";
          devices[i+1].UseForControlChecked = "checked";
        }
      }
    }
  }


  devices.forEach ( function(d) {
    var fd = new Ftdi.FtdiDevice(d);
    console.log(fd.deviceSettings.description);
    //console.log(JSON.stringify(fd));

    /*if ( (headers.length - 2) < Object.keys(fd.deviceSettings).length ) {
      console.log("re set headers for ftdi table")
      headers = Object.keys(fd.deviceSettings);
      headers.push("UseForData");
      headers.push("UseForControl");
      table = createTable(headers);
      tableHTML = ''
      table.on('data', data => tableHTML += data)
      table.on('end', () => document.getElementById('ftdi_ports').innerHTML = tableHTML)
    }*/

    var p = {}
    Object.keys(fd.deviceSettings).forEach(function eachKey(key) {
      p[key] = (fd.deviceSettings[key]).toString();
    })
    //p.UseForData = `<button id="${p["locationId"]}" tag="${p["serialNumber"]}" name="${p["description"]}" onclick="serialSelect(this)">Data</button>`;
    // Per materializecss docs:
    // Match the label for attribute to the input's id value to get the toggling effect
    console.log(d["UseForDataChecked"]);
    p.UseForData = `<p><label for="UseForData${p["locationId"]}"><input type="checkbox" id="UseForData${p["locationId"]}" tag="${p["serialNumber"]}" name="${p["description"]}" ${d["UseForDataChecked"] === "" ? "" : "checked=\"checked\""} onclick="serialCheckbox(this)" /><span>Data</span></label></p>`;
    p.UseForControl = `<p><label for="UseForControl${p["locationId"]}"><input type="checkbox" id="UseForControl${p["locationId"]}" tag="${p["serialNumber"]}" name="${p["description"]}" ${d["UseForControlChecked"] === "" ? "" : "checked=\"checked\""} onclick="serialCheckbox(this)" /><span>Control</span></label></p>`;

    table.write(p)
  });
  table.end();





  /*var headers = Object.keys(ports[0])
  headers.push("selectthisone")
  const table = createTable(headers)
  tableHTML = ''
  table.on('data', data => tableHTML += data)
  table.on('end', () => document.getElementById('vcp_ports').innerHTML = tableHTML)
  ports.forEach(function(port){
    var p = {}
    Object.keys(port).forEach(function eachKey(key) {
      p[key] = port[key]
    })
    p.selectthisone = "<button id=\"b1\" name=\"" + port["comName"] + "\" onclick=\"serialSelect(this)\">selectme</button>"
    table.write(p)
  })
  table.end();*/
});



// TODO 11/27/19
// - complete wiring up the open/close/testwrite buttons and diable/enable
//   functionality for the control port
// - after data port finishes it's startup speed test for now, and for any disabled-ness
//   wire up that a click sees if it can re-open that port, and then green and then
//   if click, then show the data port interaction pane, including 3 button basics
//   eg open, close, and maybe like measure incoming data sample rate
//


// https://serialport.io/docs/en/api-stream
// For driver management on  Mac OS X, see Readme
// Tested with 115200
// After plist update to the right FT2232H_A (?) device ID in the Plist.info
// for the FTDI driver and kextunload and kextreload mapping 300 to 12000000...
// Aliasing seems to be not working
// Direct use of 3,000,000 looks ok - directly as a call
// But can't call with a higher value, and aliasing seems to do nothing

// BELOW: For VCP including AppleUSBFTDI
// First testing version of function, for traditional VCP style only
var serialOpenByName = function (name) {

  //port = new SerialPort(name, { autoOpen: false, baudRate: 3000000 }, function (err) {
  var settings = {
    autoOpen: false,
    baudRate: 57600, //9600, //57600, //921600, //57600,
    databits: 8,
    stopbits: 1,
    parity  : 'none',
  };
  port = new SerialPort(name, settings, function (err) {
    if ( err ) {
      return console.log('sprenderer: error on create new: ', err.message)
    }
  });
  port.on('open', function() {
    console.log('port.on open');
  });
  //port.on('data', function (data) {
  //  console.log('Data: ', data);
  //});
  port.on('data', function (data) {
    console.log ("port.on data");
    //if ( data.length > 3000 ) {  // just testing - so would like to see a large sample
    if ( !filling ) {
      setTimeout(function() {
        mainWindowUpdateChartData(buf);
        buf = [];
        filling = false;
      }, 3000);
      filling = true;
    }
    if ( filling ) {
      data.forEach(function(d) {
        buf.push(d);
      });
    }

    //ipcRenderer.send('port:ondata', data);
    //console.log('Data: (length): ', data.length);
    console.log(data);
    console.log("Same data parsed as ASCII chars: ");
    console.log(hexBufToAscii(data));
    //}
  });
  port.open()
}
/* ABOVE: Standard VCP Serial port, works with AppleUSBFTDI too */





// BELOW: For D2XX FTDI -
// first dev testing function - retained for reference and testing for now
var devSerialOpenByName = function (name) {

  port = new Ftdi.FtdiDevice(0); // for d2xx only

  port.on('error', function(err) {
    console.log('port.on error: ', err);
  });
  port.on('close', function(err) {
    console.log('close event subscription ');
    console.timeEnd("timeOpen");
    console.log("samples collected: " + samples);
    const difftime = process.hrtime(time);
    // difftime contains [seconds, nanoseconds] difference from start time
    const nsps = 1e9; // nano sec per sec
    var dt_sec = difftime[0] + difftime[1]/nsps;
    var sps = samples / dt_sec;
    console.log(`Delta time by hrtime: ${dt_sec} seconds giving ${sps} samples per second for ${samples} samples.`);

    // 261120 samples in about 1 Second
    // 32347.4 samples per chan in that time
    // Target sample trig rate: 7.8125 ms (sweeping 8 chans)
    // 2500 samples / 7.8125ms => 320 samples/ms => 320000 samples / second
    // We are close - the 261120 is repeatable
    // However, FPGA set up for 4096 samples per buffer or snapshot
    // so at 4096 samples / 7.8125 ms => 524288 samples per second
    // so, 261,120 is about half that, half that would be 262,144 (the difference is just 1024)
    // so perhaps the toggling of the pin on the MCU is just half the sample trigger rate,
    // howeve also, it seems that generally data rate may be good
    // yes, we are just toggling, so need to double this ...
    //
    // Now with 7.8125 ms clock timing and ISR running high/low getting
    // 526320 samples per approx second
    // Expectation would be:
    // 4096 samples / 7.8125 ms X 1000 ms / s => 524,288 samples/second
    // This is 4 x 2 x 2 for 1/2 inch transducers, 1/2 overlap, 4 in/sec travel speed
    // => 128 WFs/sec, assuming equally spaced in time gives 7.8125ms capture
    // and transmit the waveform of 4096 (was 2500) samples or whatever length + headers

    console.log(`For 4096 of 8-bit data or samples each for 128 WF/sec is 4096x128 = 524,288 bytes/sec`);
    var dsps = sps - (4096 * 128);
    console.log(`Actual samples per second (sps) - theoretical sps: ${dsps} sps => ${dsps/(4096*128)*100}%`);
    console.log(`Delta samples in the 1 second sample period, excluding port overhead, actual samples - theoretical: ${samples - 4096*128}`);


  });
  port.on('open', function(err) {
    console.log('port.on open');
    console.time("timeOpen");
    //time = process.hrtime();  // restart the timer, storing in "time"
    setTimeout( function() {
      port.close();
    }, 1000);
  });
  port.on('data', function (data) {
    console.log ("port.on data");

    if ( !time ) {
      time = process.hrtime();  // restart the timer, storing in "time"
    }

    // data is a NodeJS Buffer object
    console.log("buf.length (pre-append): " + buf.length);
    buf.push(...data);
    //console.log(JSON.stringify(buf));
    console.log("buf.length: " + buf.length);
    /*if ( buf.length >= 2500 ) {
      console.log("buf.length: " + buf.length);
      mainWindowUpdateChartData(buf.slice(0,2499));
      buf = [];
    }*/
    samples += data.length;

    //if ( !filling ) {
      /*setTimeout(function() {
        mainWindowUpdateChartData(buf);
        buf = [];
        filling = false;
      }, 2000);
      filling = true;
      */
      //mainWindowUpdateChartData(buf);
      //buf = [];
    //}

    /*if ( filling ) {
      data.forEach(function(d) {
        buf.push(d);
      });
    }*/

    //ipcRenderer.send('port:ondata', data);
    //console.log('Data: (length): ', data.length);
    //console.log(data);
    //}
  });

  // Really for this to work, you need to:
  // Install the D2XX driver package
  // Install the D2XX helper package (if applicable)
  // kextunload the vcp driver (on Mac OS X anyway)
  // And then in the serial port list, your FTDI driver won't show (!)
  // But if you only have one FTDI device connected,
  // the stuff below works
  // And testing with OScope - yes, single bit is 12MHz time long
  // Or 6MHz clock cycle or so -- so we're in the right ballpark
  // We've updated the node-ftdi wrapper such that opening without a baudrate
  // and data format may give errors (as expected) to the console, but now
  // can return without error such that program execution continues -
  // because using this with eg async 245 fifo mode doesn't require that information
  // and futher that information has no meaning - so we only need the open call
  //
  // Thus even if using D2XX correctly, you will see output like:
  // Can't setBaudRate: FT_IO_ERROR
  // Can't Set DeviceSettings: FT_IO_ERROR
  //
  // This will be for any baud rate, and so far it is believed this is because
  // simply in a/sync 245 FIFO mode, these settings have no meaning
  // Rather data is just returned as clocked.
  // TODO Vfy clocking rate now with in-circuit usingHDL-0108-RSCPT Actual
  //
  // Again: settings now shown for concept, but regardless, opening with
  // any baud rate, even standard, will throw errors shown above just due to
  // irrelevance, it is thought ...
  var settings = {
    baudrate: 12000000, //57600, // either way, error(s) will be thrown at app log output (command line)
    databits: 8,
    stopbits: 1,
    parity  : 'none',
  };
  port.open({ //{
    //baudrate: 12000000,
    //databits: 8,
    //stopbits: 1,
    //parity: 'none',
    //// bitmode: 'cbus', // for bit bang
    //// bitmask: 0xff    // for bit bang
    settings
  });


  //});
}
/* */ /* ABOVE: For D2XX */





var btnDataPortClick = function(button) {
  if ( $(button).hasClass("green") === false ) {
    //console.log("data port button clicked: but button is not green = active port - so, returning");
    openDataPortThatIsChecked();
  } else {
    if ( dport ) {
      dport.close();
    } else {
      console.log("data port button clicked: button is not green = active port but dport is not anything, so can't do anything to close it - so, returning");
    }
  }
}






var btnControlPortClick = function(button) {

  // For control port button, instead we just use color as an indicator
  // and the click only for expansion/hide section
  // This demo's standard control buttons within the section

  //if ( $(button).hasClass("green") === false ) {
    //console.log("control port button clicked: but not active - returning");
    ////return;
    //openControlPortThatIsChecked();
  //} else {
    if ( $('#activeControlPort').is(":visible") ) {
      $('#activeControlPort').hide("slow");
      return;
    }
    $('#activeControlPort').show("slow");
  //}


}







//var datBuf = Buffer.alloc(4096, 63); // allocate 4096 byte buffer, fill with 0x00
// Below for FTDI D2XX - for the data port (async fifo styling of streaming data)
var sofFound = false;
var srcIndexStart = 0;
var openDataPort = function(portHash) {
  console.log("openDataPort: " + JSON.stringify(portHash));

  dport = new Ftdi.FtdiDevice({
    locationId: portHash.locationId,
    serialNumber: portHash.serialNumber }); // for d2xx only

  dport.on('error', function(err) {
    console.log('dport.on error: ', err);
    // TODO -- UI error panel/log/indicator, etc.
  });

  dport.on('close', function(err) {
    console.log('close event subscription ');
    console.timeEnd("timeOpen");
    console.log("samples collected: " + samples);
    const difftime = process.hrtime(time);
    // difftime contains [seconds, nanoseconds] difference from start time
    const nsps = 1e9; // nano sec per sec
    var dt_sec = difftime[0] + difftime[1]/nsps;
    var sps = samples / dt_sec;
    console.log(`Delta time by hrtime: ${dt_sec} seconds giving ${sps} samples per second for ${samples} samples.`);

    // 261120 samples in about 1 Second
    // 32347.4 samples per chan in that time
    // Target sample trig rate: 7.8125 ms (sweeping 8 chans)
    // 2500 samples / 7.8125ms => 320 samples/ms => 320000 samples / second
    // We are close - the 261120 is repeatable
    // However, FPGA set up for 4096 samples per buffer or snapshot
    // so at 4096 samples / 7.8125 ms => 524288 samples per second
    // so, 261,120 is about half that, half that would be 262,144 (the difference is just 1024)
    // so perhaps the toggling of the pin on the MCU is just half the sample trigger rate,
    // howeve also, it seems that generally data rate may be good
    // yes, we are just toggling, so need to double this ...
    //
    // Now with 7.8125 ms clock timing and ISR running high/low getting
    // 526320 samples per approx second
    // Expectation would be:
    // 4096 samples / 7.8125 ms X 1000 ms / s => 524,288 samples/second
    // This is 4 x 2 x 2 for 1/2 inch transducers, 1/2 overlap, 4 in/sec travel speed
    // => 128 WFs/sec, assuming equally spaced in time gives 7.8125ms capture
    // and transmit the waveform of 4096 (was 2500) samples or whatever length + headers

    /* Needs new implementation:
    console.log(`For 4096 of 8-bit data or samples each for 128 WF/sec is 4096x128 = 524,288 bytes/sec`);
    var dsps = sps - (4096 * 128);
    console.log(`Actual samples per second (sps) - theoretical sps: ${dsps} sps => ${dsps/(4096*128)*100}%`);
    console.log(`Delta samples in the 1 second sample period, excluding port overhead, actual samples - theoretical: ${samples - 4096*128}`);
    */

    $("#btnDataPortStatus").removeClass('green pulse').addClass('blue-grey');
    $("#btnListeningForData").removeClass('pulse').addClass('disabled');
    $("#btnSilenceIndicators").addClass('disabled');

    mainWindowUpdateChartData(null); // should call the cancel on the requestAnimationFrame

  });

  dport.on('open', function(err) {
    // TODO checkbox for run test on open
    //$("#serialPortGoButton").addClass("lighten-5");
    //$("#serialPortGoButton").removeClass("waves-light");
    $("#serialPortGoButton").addClass("red");
    $("#btnDataPortStatus").removeClass('hide blue-grey').addClass('green pulse');
    $("#btnListeningForData").removeClass('hide disabled').addClass('pulse');
    $("#active_ports_ui_status_indicators").removeClass('hide');
    $("#active_ports_ui_buttons").removeClass('hide');
    $("#btnSilenceIndicators").removeClass('disabled');
    console.log('dport.on open');
    console.time("timeOpen");
    //time = process.hrtime();  // restart the timer, storing in "time"

    sofFound = false;

    mainWindowUpdateChartData(null); // init the loop for requestAnimationFrame

    // Optionally stop the pulsing
    /*setTimeout( function() {
      $("#btnListeningForData").removeClass('pulse');
      $("#btnDataPortStatus").removeClass('pulse');
      // TODO check if any have pulse, and if not then disable btnSilenceIndicators
    }, 5000);
    */


    /*
    //For Freq measurement real world samples over time
    setTimeout( function() {
      dport.close();
    }, 1000);
    */

  });

  //var n = 0;
  //var sofFound = false;
  //var srcIndexStart = 0;
  const sof = [0xaa, 0x55, 0xaa, 0x55, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0xff, 0x00];
  const sofSkipMatchByte = [ 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
  dport.on('data', function (data) {
    //console.log ("dport.on data");
    //console.log(data);

    // Freq measuring stuff
    /*
    if ( !time ) {
      time = process.hrtime();  // restart the timer, storing in "time"
    }

    // data is a NodeJS Buffer object
    console.log("buf.length (pre-append): " + buf.length);
    buf.push(...data);
    //console.log(JSON.stringify(buf));
    console.log("buf.length: " + buf.length);
    */

    var pushStartIndex = 0;

    if ( !sofFound ) {

      // Wait for and start dumping data on SOF found
      // SOF goes:
      // initial begin
      // sof[0] <= 8'h aa;
      // sof[1] <= 8'h 55;
      // sof[2] <= 8'h aa;
      // sof[3] <= 8'h 55;
      //
      // sof[8] <= 8'h ff;
      // sof[9] <= 8'h 00;
      // sof[10] <= 8'h ff;
      // sof[11] <= 8'h 00;
      // end

      console.log("looking for SOF (sofFound === false)");

      buf.push(...data);
      //console.log(buf);

      var sofSize = 12;
      var bufSize = 4095;
      const bufMult = 10;

      if ( buf.length > (sofSize -1) && buf.length < (bufSize * bufMult + 1 - sofSize) ) {

        var matchIndex = buf.indexOf(0xAA, srcIndexStart);
        console.log("matchIndex: " + matchIndex + " for srcIndexStart: " + srcIndexStart);

        if ( matchIndex > -1 ) {

          var stillGood = true;
          var i = 0;
          while ( stillGood  && ( i < sofSize ) ) {
            if ( !sofSkipMatchByte[i] ) {
              stillGood = buf[ matchIndex + i ] === sof[ i ];
            }
            i++;
          }

          console.log("stillGood: " + stillGood + " for i breaking out of while at: " + i);
          if ( stillGood ) {
            sofFound = true;
            pushStartIndex = matchIndex; // yes, we'll keep the SOF bytes in the graph output / buffer
            console.log("pushing starting from: " + pushStartIndex + " to stream buffer from source buffer of size: " + buf.length);
            var b = new Buffer.from(buf.slice(pushStartIndex));
            // Yes, we want to "put" a typeof Buffer here - otherwise weird behavior with current versions, perhaps all versions
            ourReadableStreamBuffer.put(b); //, buf.length));
            //console.log(buf.slice(pushStartIndex, buf.length));
            buf = [];
            srcIndexStart = 0; //??// already reset on each port open, so not needed?
          } else {
            srcIndexStart += i;
          }

        } else {  // match not found
          srcIndexStart += buf.length;
        }

      } else if ( buf.length > (bufSize * bufMult - sofSize) ) {
        console.log(`buf.length > ${bufSize * bufMult - sofSize} and not sofFound, so aborting the SOF test and just pushing data to stream regardless. buf size: ${buf.length}`);
        sofFound = true;
        buf = [];
        srcIndexStart = 0;
      }
      console.log("sofFound: " + sofFound + " set pushStartIndex: " + pushStartIndex);

    } else {  // SOF has already been found
      ourReadableStreamBuffer.put(data);
    }


    /*if ( buf.length >= 2500 ) {
      console.log("buf.length: " + buf.length);
      mainWindowUpdateChartData(buf.slice(0,2499));
      buf = [];
    }*/


  });   // end dport.on('data'...)

  // Really for this to work, you need to:
  // Install the D2XX driver package
  // Install the D2XX helper package (if applicable)
  // kextunload the vcp driver (on Mac OS X anyway)
  // And then in the serial port list, your FTDI driver won't show (!)
  // But if you only have one FTDI device connected,
  // the stuff below works
  // And testing with OScope - yes, single bit is 12MHz time long
  // Or 6MHz clock cycle or so -- so we're in the right ballpark
  // We've updated the node-ftdi wrapper such that opening without a baudrate
  // and data format may give errors (as expected) to the console, but now
  // can return without error such that program execution continues -
  // because using this with eg async 245 fifo mode doesn't require that information
  // and futher that information has no meaning - so we only need the open call
  //
  // Thus even if using D2XX correctly, you will see output like:
  // Can't setBaudRate: FT_IO_ERROR
  // Can't Set DeviceSettings: FT_IO_ERROR
  //
  // This will be for any baud rate, and so far it is believed this is because
  // simply in a/sync 245 FIFO mode, these settings have no meaning
  // Rather data is just returned as clocked.
  // TODO Vfy clocking rate now with in-circuit usingHDL-0108-RSCPT Actual
  //
  // Again: settings now shown for concept, but regardless, opening with
  // any baud rate, even standard, will throw errors shown above just due to
  // irrelevance, it is thought ...
  /*var settings = {
    baudrate: 12000000, //57600, // either way, error(s) will be thrown at app log output (command line)
    databits: 8,
    stopbits: 1,
    parity  : 'none',
  };*/
  // Does this work for an async fifo style of data port, without any settings?
  // Works and still do get those open errors on termial console
  dport.open({ //{
    //baudrate: 12000000,
    //databits: 8,
    //stopbits: 1,
    //parity: 'none',
    //// bitmode: 'cbus', // for bit bang
    //// bitmask: 0xff    // for bit bang
    //settings
  });


  //});

}






var getVcpPortNameFromPortInfoHash = function (infoHash) {
  var serialNumberLessAorB = infoHash.serialNumber.substr(0, infoHash.serialNumber.length - 1);
  var suffix = infoHash.serialNumber.substr(infoHash.serialNumber.length - 2, 1);
  console.log("getVcpPortNameFromPortInfoHash: base serial number: " + serialNumberLessAorB + " with suffix found to be: " + suffix);

  // Or simply just regex replace trailing A with 0 and trailing B with 1
  var sn = infoHash.serialNumber.replace(/A$/,'0').replace(/B$/,'1');
  console.log("getVcpPortNameFromPortInfoHash: regexd last digit swap: " + sn);

  // On MAC OS X so far, the A or B trailing is replaced by corresponding 0 or 1
  // div class cv contains text
  var t = $('#vcp_ports').find("td[data-header='comName']").find(".cv:contains('" + sn + "')");
  console.log("Number of VCP comNames matching the selected control port serialNumber: " + t.length);

  console.log("comName is chosen as: " + $(t).text());

  return $(t).text();


  //
  // TODO WIN32
  // TODO BIG TIME -- for Windows implementation XXXX
  //

}




// Below for FTDI D2XX - for the control port (serial style, but likely still under d2xx/ftdi)
// ok or now includes VCP implementation as well for control port
var openControlPort = function(portHash) {

  console.log("openControlPort: " + JSON.stringify(portHash));

  //console.log("Prior, openControlPort used the FTDI device to open the control port.");
  //console.log("However, there are wrapper/driver errors and this is not reliable.");
  //console.log("Thus, we are now using and require VCP access to the control port.");





  // When using VCP driver access (serial port, etc.) for control port:
  //*

  // When listed in the FTDI device section, the serialNumber, less the trailing
  // A or B matches the serialNumber as listed in the VCP listing.
  // However, in the VCP listing, the locationId doesn't match the FTDI device
  // locationId, and the serialNumber is the same for both instances in the VCP
  // listing.
  // It is the VCP listing comName that differentiates the two sections of the
  // device, for Mac OS X anyway.
  // VCP instance, Mac OS X: /dev/tty.usbserial-serialNumber0/1 where the last
  // digit corresponds to A or B in the serialNumber for the FTDI device listing.

  var comName = getVcpPortNameFromPortInfoHash(portHash);

  var settings = {
    autoOpen: false,
    baudRate: 57600, //9600, //57600, //921600, //57600,
    databits: 8,
    stopbits: 1,
    parity  : 'none',
  };
  cport = new SerialPort(comName, settings, function (err) {
    if ( err ) {
      return console.log('sprenderer: openControlPort: error on create new VCP style control port: ', err.message)
    }
  });
  cport.on('error', function(err) {
    console.log('cport.on error: ', err);
    // TODO -- UI error panel/log/indicator, etc.
  });
  cport.on('close', function(err) {
    console.log('cport.on close');
    $("#btnControlPortStatus").removeClass("green").addClass('blue-grey');
    $("#controlPortOpenBtn").prop('disabled', false);
    $("#controlPortCloseBtn").prop('disabled', true);
  });
  cport.on('open', function() {
    console.log('cport.on open');
    $("#btnControlPortStatus").removeClass('hide blue-grey').addClass('green');
    $("#activeControlPortName").text(getSelectedControlPortInfoHash().description);
    $("#controlPortOpenBtn").prop('disabled', true);
    $("#controlPortCloseBtn").prop('disabled', false);
  });
  cport.on('data', function (data) {
    console.log ("cport.on data");
    //console.log(data);
    console.log("Same data parsed as ASCII chars: ");
    var retD = hexBufToAscii(data);
    console.log(retD);
    showControlPortOutput(retD);
  });
  cport.open()

  //*/ // Above section: when using VCP driver access for control port







  // When using FTDI device wrapper for the Control Port, use section next below:
  /*
  cport = new Ftdi.FtdiDevice({
    locationId: portHash.locationId,
    serialNumber: portHash.serialNumber }); // for d2xx only

  cport.on('error', function(err) {
    console.log('cport.on error: ', err);
    // TODO -- UI error panel/log/indicator, etc.
  });
  cport.on('close', function(err) {
    console.log('cport.on close');
    $("#btnControlPortStatus").removeClass("green").addClass('blue-grey');
    $("#controlPortOpenBtn").prop('disabled', false);
  });
  cport.on('open', function(err) {
    // TODO set up div or button to indicate active connection
    //$("#serialPortGoButton").addClass("red");
    console.log('cport.on open');
    $("#btnControlPortStatus").removeClass('hide blue-grey').addClass('green');
    $("#activeControlPortName").text(getSelectedControlPortInfoHash().description);
    $("#controlPortOpenBtn").prop('disabled', true);
    //console.log(getSelectedControlPortInfoHash().description);
  });
  cport.on('data', function (data) {
    console.log ("cport.on data");
    console.log(data);
  });
  */ // End of cport using FTDI Device wrapper/driver

  // Really for this to work, you need to:
  // Install the D2XX driver package
  // Install the D2XX helper package (if applicable)
  // kextunload the vcp driver (on Mac OS X anyway)
  // And then in the serial port list, your FTDI driver won't show (!)
  // But if you only have one FTDI device connected,
  // the stuff below works
  // And testing with OScope - yes, single bit is 12MHz time long
  // Or 6MHz clock cycle or so -- so we're in the right ballpark
  // We've updated the node-ftdi wrapper such that opening without a baudrate
  // and data format may give errors (as expected) to the console, but now
  // can return without error such that program execution continues -
  // because using this with eg async 245 fifo mode doesn't require that information
  // and futher that information has no meaning - so we only need the open call
  //
  // Thus even if using D2XX correctly, you will see output like:
  // Can't setBaudRate: FT_IO_ERROR
  // Can't Set DeviceSettings: FT_IO_ERROR
  //
  // This will be for any baud rate, and so far it is believed this is because
  // simply in a/sync 245 FIFO mode, these settings have no meaning
  // Rather data is just returned as clocked.
  // TODO Vfy clocking rate now with in-circuit usingHDL-0108-RSCPT Actual
  //
  // Again: settings now shown for concept, but regardless, opening with
  // any baud rate, even standard, will throw errors shown above just due to
  // irrelevance, it is thought ...

  /*
  var settings = {
    baudrate: 57600, // either way, error(s) will be thrown at app log output (command line)
    databits: 8,
    stopbits: 1,
    parity  : 'none',
  };

  cport.open({ //{
    //baudrate: 12000000,
    //databits: 8,
    //stopbits: 1,
    //parity: 'none',
    //// bitmode: 'cbus', // for bit bang
    //// bitmask: 0xff    // for bit bang
    settings
  });
  */

}




// TODO move to utils
// https://www.w3resource.com/javascript-exercises/javascript-string-exercise-28.php
function hexBufToAscii (dataAsHexBuf) {
	var str = '';
	for (var n = 0; n < dataAsHexBuf.length; n++) {
		str += String.fromCharCode(parseInt(dataAsHexBuf[n]));
	}
	return str;
}






var serialClose = function () {
  if ( port ) port.close ( function (err) {
    console.log('port.close called')
    if ( err) {
      return console.log('sprenderer: error on close: ', err.message)
    }
  });
}





var controlPortClose = function() {
  //console.log("controlPortClose");
  if ( cport ) cport.close ( function (err) {
    console.log ('controlPortClose called');
    if ( err ) {
      return console.log('sprenderer: error on cport close: ', err.message);
    }
  });
}






var controlPortOpen = function() {
  openControlPortThatIsChecked();
}







var serialCheckbox = function (checkbox) {
  // Check that one data and one control port are selected
  var nDataChecked = $("[id^=UseForData][type=checkbox]:checked").length;
  var nControlChecked = $("[id^=UseForControl][type=checkbox]:checked").length;
  if ( nDataChecked === 1 && nControlChecked === 1 ) {
    console.log( "Ok, one data and one control port selected.");
    // Now populate/show/enable the "Go" button to open ports and prep
    var h = `<button id="serialPortGoButton" class="waves-effect waves-light btn-large" onclick="beginSerialComms(this)"><i class="material-icons left">device_hub</i>Connect to Ports and Begin Listening for Data</button>`;
    $('#ports_go_button').html(h).removeClass('hide'); // `<button id="serialPortGoButton" name="" onclick="beginSerialComms(this)">Begin</button>` );
  } else {
    // TODO - complete the disable code
    $('#ports_go_button').addClass('hide');
  }
}





var getSelectedDataPortInfoHash = function() {
  return checkboxToPortHash($("[id^=UseForData][type=checkbox]:checked"));
}





var getSelectedControlPortInfoHash = function() {
  return checkboxToPortHash($("[id^=UseForControl][type=checkbox]:checked"));
}




// Dual-port device style port opening
var beginSerialComms = function(button) {
  // make hash for port ID for data and call that function
  //var dataPortHash = checkboxToPortHash($("[id^=UseForData][type=checkbox]:checked"));
  //openDataPort(dataPortHash);
  openDataPortThatIsChecked();

  // make hash for control port (serial) ID and call that function
  //var controlPortHash = checkboxToPortHash($("[id^=UseForControl][type=checkbox]:checked"));
  //openControlPort(controlPortHash);
  openControlPortThatIsChecked();


  // TODO if no errors, then collapse the selection window ...
  $("#serialPortSelectionAccordion").collapsible('close'); //.children('li:first-child'));
}





var openControlPortThatIsChecked = function() {
  // make hash for control port (serial) ID and call that function
  var controlPortHash = checkboxToPortHash($("[id^=UseForControl][type=checkbox]:checked"));
  openControlPort(controlPortHash);
}





var openDataPortThatIsChecked = function() {
  var dataPortHash = checkboxToPortHash($("[id^=UseForData][type=checkbox]:checked"));
  openDataPort(dataPortHash);
}





var checkboxToPortHash = function(checkbox) {
  var r = {};
  r.serialNumber = $(checkbox).attr('tag');
  //console.log("CAUTION: Is the locationId always numeric across platforms? Or do we need to differentiate UseForControl vs UseForData");
  // Now, just grab if this is Data or Control and grab the location Id info after that from the ID
  var ptype = $(checkbox).siblings('span').text();
  var locId = $(checkbox).attr('id');
  r.locationId = locId.substr(locId.indexOf(ptype)+ptype.length);
  r.description = $(checkbox).attr('name');
  //console.log(JSON.stringify(r));
  return r;
}





var serialTestWrite = function () {
  if ( port ) {
    /*var size = 10;
    var buffer = new Buffer(size);
    var i = 0;
    for (i=0; i<size; i++) {
      buffer[i] = 0xaa;
    }*/
    var cmd = [ 0x53, 0xC1, 0x00, 0x00, 0x50 ]; // Get Test WF (vs C4 01 is PAQ from RAM)
    //port.write('Testing123', function (err) {
    //port.write(buf, function (err) {
    port.write(cmd, function (err) {
      if ( err ) {
        console.log('sprenderer: error on write: ', err.message)
      }
    });
  }
}





var controlPortSendStuff = function (textInput) {
  //console.log(textInput);
  var t = $(textInput).val();
  //console.log("controlPortSendStuff: t: " + t);
  if ( cport ) {
    cport.write(t);
    /*$(textInput).text().split('').forEach(function(c) {
      cport.write()
    });*/
  } else {
    console.log("I'd really like to help you man, but cport is not a thing, so can send stuff through it ...");
    console.log("I'd really like to help you man ...");
  }
}






var serialSendData = function ( commandAndType, returnDataTo) {
  if ( port ) {
    var cmdarr = [];
    // Warning: there needs of course to be some kind of limits and sanity
    // checking structure -- length of commands, etc.
    // This could be a separate structure that is required with an imported
    // command set such that validation occurs within this ruleset prior to
    // allowing execution
    switch ( commandAndType.type ) {

      case "hexCsvBytes":
        var cmd = commandAndType.value.replace(/\s/g,"").split(',');
        var cmdarr = [];
        cmd.forEach(function(c) {
          cmdarr.push(parseInt(c));
        });
        console.log(cmdarr);
        port.write(cmdarr, function (err) {
          if ( err ) {
            console.log('sprenderer: error on write within serialSendData: ', err.message)
          }
        });
        break;

      case "hexCsvBytesChained":
        var delayBwCalls = parseInt(commandAndType.chainedCmdDelayMs);
        var responseTimeout = parseInt(commandAndType.chainedCmdTimeoutMs);
        var responseTermChar = commandAndType.chainedCmdCompleteChar;
        if ( delayBwCalls ) {
          // Use
          var totTimeout = 0;
          var len = commandAndType.value.length;
          console.log("hexCsvBytesChained: " + len + " commands found ...");
          commandAndType.value.forEach ( function (catv, index) {
            var cmd = catv.replace(/\s/g,"").split(',');
            var cmdarr = [];
            cmd.forEach(function(c) {
              cmdarr.push(parseInt(c));
            });
            setTimeout( function () {
              console.log("Firing command " + (index + 1) + " of " + len);
              console.log(cmdarr);
              port.write(cmdarr, function (err) {
                if ( err ) {
                  console.log('sprenderer: error on write within serialSendData: ', err.message)
                }
              });
            }, totTimeout, index, len, cmdarr);
            totTimeout += delayBwCalls;
            console.log("Total timeout: " + totTimeout);
          });
        } else
        if ( !delayBwCalls && ( responseTimeout && responseTermChar ) ) {
          // Is arguments.callee.name deprecated or not?
          console.log(arguments.callee.name + ": hexCsvBytesChained with sequenced cmds issued and termination of each stage based on response termination character or response timeout");
          // See above - parsers requires a new serialport
          //const parser = port.pipe(new Delimiter({ delimiter: '\n'}));
          //parser.on('data', console.log);
        }
        break;
        // End case: hexCsvBytesChained

      default:
        console.log('sprenderer: error on serialSendData: type in command with type is not (yet) supported: ' + commandAndType.type);
    }



  } else {  // if not port ...
    console.log ('sprenderer: error on serialSendData: port does not yet exist or has not been opened');
  }

}






var showControlPortOutput = function ( asciiStuff ) {

  $('#cmdOutput').prepend(asciiStuff); // or prepend()
  // nogo ... :
  //$('#cmdOutput').scrollTop($('#cmdOutput').prop("scrollHeight"));
}




var executingTimeoutFcns = [];
var controlPortSendData = async function ( commandAndType, returnDataTo, button) {

  console.log("controlPortSendData");

  if ( cport ) {

    var cmdarr = [];

    // TODO Warning: there needs of course to be some kind of limits and sanity
    // checking structure -- length of commands, etc.
    // This could be a separate structure that is required with an imported
    // command set such that validation occurs within this ruleset prior to
    // allowing execution

    // Switch structure here for more complex possibilities --
    // if none, could condense quite a bit
    if ( returnDataTo ) {
      switch ( returnDataTo ) {
        case "chart":
          // Currently, if dport is open, mainWindowUpdateChartData will have
          // already been called thus setting up the charts or multicharts
          // for the render loops -- if the chart type has changed we need to cycle
          // this -- so the assumption is that calling it twice will cancel and
          // then restart the render loops with the new gReturnDataTo value
          // Obviously, this can be encapsulated and cleaned up
          // Quick demo fix ... :
          if ( gReturnDataTo !== returnDataTo ) {
            mainWindowUpdateChartData(null);
            gReturnDataTo = "chart";
            console.log("Switched gReturnDataTo to chart");
            mainWindowUpdateChartData(null);
          }
          // Placeholder for more complex actions
          break;

        case "multiChart":
          // Quick demo fix ... :
          if ( gReturnDataTo !== returnDataTo ) {
            mainWindowUpdateChartData(null);
            gReturnDataTo = "multiChart";
            console.log("Switched gReturnDataTo to multiChart");
            mainWindowUpdateChartData(null);
          }
          break;

        default:
          console.log("controlPortSentData: unhandled returnDataTo case: " + returnDataTo);
          break;
      }
    }

    //console.log(button.options);
    //var cancelThis = false;
    var doFileCapture = false;
    var doFileCaptureCustomToDirectory = false;
    var captureSizeBytes = null;
    var captureSizeNumberOfWaveformsPerFile = null;
    if ( button.options ) {
      button.options.forEach( function(o) {
        switch ( o.key ) {
          case "singleCaptureBuffer":
            //console.log("button option: singleCaptureBuffer is " + o.value);
            // TODO this is poor compartmentalized coding - this fcn is in the
            // mainWindow.html at the moment
            // Anyway, reset and just use a single chunksize buffer
            resetReadableStream(1);
            break;

          case "captureBufferMultiple":
            resetReadableStream(parseInt(o.value));
            break;

          case "captureSizeBytes":
            captureSizeBytes = parseInt(o.value.number);
            break;

          case "captureSizeNumberOfWaveformsPerFile":
            captureSizeNumberOfWaveformsPerFile = parseInt(o.value.number);
            break;

          case "fileCapture":
            doFileCapture = o.value;
            break;

          case "fileCaptureCustomToDirectory":
            doFileCaptureCustomToDirectory = o.value;
            break;

          default:
            console.log("controlPortSendData: Unrecognized button option: " + o.key);
        }
      });
    }

    // Done parsing button options, now run any setups if needed with the
    // garnered items

    if (!doFileCapture && !doFileCaptureCustomToDirectory ) {
      console.log("first controlPortSendData_SetupAndSendCommands about to be called");
      controlPortSendData_SetupAndSendCommands(commandAndType);
    }

    if ( doFileCapture || doFileCaptureCustomToDirectory ) {

      // https://electronjs.org/docs/api/dialog

      if ( doFileCapture) {
        currentWriteStreamFilepath = dialog.showSaveDialog( {
          //options : {
            title : 'Create your destination captured data file ...',
            buttonLabel: 'Start Capture'
          //}
        });
        console.log("file picker result: " + currentWriteStreamFilepath);
      }

      var captureDataFileOutputDirectory;
      if ( doFileCaptureCustomToDirectory ) {
        captureDataFileOutputDirectory = dialog.showOpenDialog( {
          title : 'Select and/or create your captured data directory ...',
          buttonLabel: 'Start Capture to this Directory',
          properties: [ 'openDirectory', 'createDirectory']
        });
        console.log("file picker result: " + captureDataFileOutputDirectory);
      }

      if ( !captureDataFileOutputDirectory && !currentWriteStreamFilepath ) {
        console.log("No file or directory selected for capture data destination, returning.");
        launchProgressCountdown(0);
        cancelThis = true;
      } else {

        console.log("Capture to file selected ... setting up ...");

        if ( doFileCapture ) {
          await setupFileCapture(
            parseInt(commandAndType.chainedCmdDelayMs),
            captureSizeBytes
          ).then ( (res) => {
            if ( !res ) {
              console.log("setupFileCapture returned : " + res + ", so ... returning, ie not proceeding with the command processing");
              launchProgressCountdown(0);
            } else {
              controlPortSendData_SetupAndSendCommands(commandAndType);
            }
          }).catch ( (e) => {
            console.log("Error proceeding after setupFileCapture and doing the command processing and sending: " + e);
            launchProgressCountdown(0);
          });
        }

        if ( doFileCaptureCustomToDirectory ) {
          setupFileCaptureCustomBatches(    // was await - but now this returns a promise
            captureDataFileOutputDirectory,
            captureSizeNumberOfWaveformsPerFile
          )
          .then( (res) => {
            if ( !res ) {
              console.error("setupFileCaptureCustomBatches returned : " + res + ", so ... returning, ie not proceeding with the command processing");
              launchProgressCountdown(0);
            } else {
              console.log("about to call controlPortSendData_SetupAndSendCommands");
              controlPortSendData_SetupAndSendCommands(commandAndType);
              // Not sure - perhaps this should be promised and chained:
              console.log("controlPortSendData: waveformsPerFile for batch output calculated to: " + captureDataFileOutputBatch.WaveformsPerFile());
            }
          })
          .catch( (e) => {
            console.error("Error proceeding after setupFileCaptureCustomBatches and doing the command processing and sending: " + e);
            launchProgressCountdown(0);
          });
        } // end: if doFileCaptureCustomToDirectory

      }
    }

  } else {  // if not port ...
    console.log ('sprenderer: error on controlPortSendData: port does not yet exist or has not been opened');
  }

}






var controlPortSendData_SetupAndSendCommands = function(commandAndType) {

  // Now handle the command type and sending the control commands to the device

  var totTimeout = 0;

  switch ( commandAndType.type ) {

    case "hexCsvBytes":
      var cmd = commandAndType.value.replace(/\s/g,"").split(',');
      var cmdarr = [];
      cmd.forEach(function(c) {
        cmdarr.push(parseInt(c));
      });
      console.log("controlPortSendData: " + cmdarr);
      cport.write(cmdarr, function (err) {
        if ( err ) {
          console.log('sprenderer: error on write within controlPortSendData: ', err.message)
        }
      });
      break;

    case "hexCsvBytesChained":
      var delayBwCalls = parseInt(commandAndType.chainedCmdDelayMs);
      var responseTimeout = parseInt(commandAndType.chainedCmdTimeoutMs);
      var responseTermChar = commandAndType.chainedCmdCompleteChar;
      if ( delayBwCalls ) {
        var len = commandAndType.value.length;
        console.log("hexCsvBytesChained: " + len + " commands found ...");
        commandAndType.value.forEach ( function (catv, index) {
          var cmd = catv.replace(/\s/g,"").split(',');
          var cmdarr = [];
          cmd.forEach(function(c) {
            cmdarr.push(parseInt(c));
          });
          var s = setTimeout( function () {
            console.log("Firing command " + (index + 1) + " of " + len);
            console.log(cmdarr);
            cport.write(cmdarr, function (err) {
              if ( err ) {
                console.log('sprenderer: error on write within controlPortSendData: ', err.message)
              }
            });
            // If this is the last command, clear the list somehow
            if ( (index + 1) === len ) {
              executingTimeoutFcns = [];
            }
          }, totTimeout, index, len, cmdarr);
          executingTimeoutFcns.push(s);
          // Could also do progress bar as percentage of steps remaining
          // or combination of that and time
          // Don't add a delay after the last call to the total
          if ( (index + 1) < len ) {
            totTimeout += delayBwCalls;
          }
          console.log("Total timeout: " + totTimeout);
        });
      } else
      if ( !delayBwCalls && ( responseTimeout && responseTermChar ) ) {
        // Is arguments.callee.name deprecated or not?
        console.log(arguments.callee.name + ": hexCsvBytesChained with sequenced cmds issued and termination of each stage based on response termination character or response timeout");
        // See above - parsers requires a new serialport
        //const parser = port.pipe(new Delimiter({ delimiter: '\n'}));
        //parser.on('data', console.log);
      }
      break;
      // End case: hexCsvBytesChained

    default:
      console.log('sprenderer: error on controlPortSendData: type in command with type is not (yet) supported: ' + commandAndType.type);
  }

  // Again, could instead use percentage of completed steps instead
  launchProgressCountdown(totTimeout);

}







setupFileCaptureCustomBatches = ( outputDirectory, numberOfWaveformsPerFile ) => {
  //var everythingIsFine = true;
  captureDataFileOutputBatch = null;

  captureDataFileOutputBatch = new CaptureDataFileOutput({
    directory: outputDirectory,
    numberOfWaveformsPerFile: numberOfWaveformsPerFile
  });

  return new Promise ((resolve, reject) => {

    captureDataFileOutputBatch.LoadCaptureOptions()
    .then( res => {
      captureDataFileOutputBatch.CheckOutputDirectory();
    })
    .then( res => {
      console.log("LoadCaptureOptions and CheckOutputDirectory OK - resolving to true");
      resolve(true);
    })
    .catch ( e => {
      console.error("setupFileCaptureCustomBatches error in chain: " + e);
      reject(false);
    });

  });

  //return everythingIsFine;
}




var fileCaptureTimeoutId = null;
var setupFileCapture = ( durationMs, maxFileSizeBytes ) => {

  // currentWriteStreamFilepath is global at present

  // https://stackoverflow.com/questions/43293921/cant-catch-exception-from-fs-createwritestream

  var everythingIsFine = true;

  currentMaxCaptureFileSizeBytes = maxFileSizeBytes;
  currentBytesCaptured = 0;

  return new Promise ((resolve, reject) => {

    // TODO - fix this up with var? with issues, etc.
    // Testing:
    resetReadableStream(8);

    writeStream = fs.createWriteStream(currentWriteStreamFilepath);
    writeStream.on('error', function(err) {
      console.log("createWriteStream for " + currentWriteStreamFilepath + " error: " + err);
      closeAndCleanupFileCapture();
      everythingIsFine = false;
      reject(everythingIsFine);
    })
    fileCaptureTimeoutId = setTimeout( function() {
      closeAndCleanupFileCapture();
    }, durationMs );
    resolve(everythingIsFine);

  });

}


var closeAndCleanupFileCapture = function() {

  launchProgressCountdown(0);
  if ( writeStream ) {
    writeStream.end();
    showControlPortOutput('Capture file closed.\r\n');
  }
  writeStream = null;
  currentWriteStreamFilepath = null;
  if ( fileCaptureTimeoutId ) {
    clearTimeout(fileCaptureTimeoutId);
  }
  fileCaptureTimeoutId = null;
  currentMaxCaptureFileSizeBytes = null;
  currentBytesCaptured = null;

}












var progressTimeoutId;
var launchProgressCountdown = function( totMs ) {

  // Could also do the progress bar as percentage of items remaining
  // https://stackoverflow.com/questions/24530908/showing-a-time-countdown-progress-bar

  // vs the parent div class that is progress
  var pbar = $('#theBarItself');

  progressTimeoutId = progress(totMs/1000, totMs/1000, pbar);

}






var progress = function (timeleft, timetotal, element) {
  console.log("progress: " + timeleft);
  var timeoutId;
  var progressBarWidth = Math.round((1.0 - (timeleft / timetotal)) * 100) + "%"; // timeleft * $element.width() / timetotal;
  console.log("current: " + $(element).css("width"));
  console.log("progress: " + progressBarWidth);
  //$(element).animate({ width: progressBarWidth }); //.html(timeleft + " seconds to go");
  $(element).css("width", progressBarWidth);
  if(timeleft > 0) {
      timeoutId = setTimeout(function() {
          progress(timeleft - 0.5, timetotal, element);
      }, 500);
  } else {
    //$(element).animate({width: "100%"}, 100);
    $(element).css("width", "100%");
    setTimeout ( function() {
      $(element).parent().css("background-color", "green");
    }, 200);
    setTimeout( function() {
      $(element).parent().animate({ backgroundColor: "#acece6"}, 2000);
    }, 500);
    setTimeout( function() {
      //$(element).animate({width: "0%"}, 1000);
      $(element).css("width", "0%");
    }, 1000);
    timeoutId = null;
  }
  progressTimeoutId = timeoutId
  return timeoutId;
};












var cancelCustomControlButtonCommand = function() {
  console.log ("cancelCustomControlButtonCommand");
  console.log(executingTimeoutFcns);
  if ( executingTimeoutFcns.length > 0 ) {
    executingTimeoutFcns.forEach( function(etf, index) {
      clearTimeout(etf);
      console.log("Clearing timeout execution for #" + index);
    });
    if ( progressTimeoutId ) {
      clearTimeout(progressTimeoutId);
      progressTimeoutId = null;
      launchProgressCountdown(0);
    }
    // if file ...close it
    showControlPortOutput("Cancel done.\r\n");
  } else {
    showControlPortOutput("Nothing to cancel.\r\n");
  }
  closeAndCleanupFileCapture();
}






var controlPortSendDataFromTextInput = function ( button, commandAndType) {

  // At this draft, button may be a button control or a p with range child

  //alert('got it');
  //return;

  if ( cport ) {
    var cmdarr = [];
    // Warning: there needs of course to be some kind of limits and sanity
    // checking structure -- length of commands, etc.
    // This could be a separate structure that is required with an imported
    // command set such that validation occurs within this ruleset prior to
    // allowing execution
    switch ( commandAndType.type ) {

      case "hexCsvBytes":
        var cmd = commandAndType.value.replace(/\s/g,"").split(',');
        var cmdarr = [];
        cmd.forEach(function(c) {
          cmdarr.push(parseInt(c));
        });
        var repl = commandAndType.positionToReplaceWithTextInputBaseZero;
        if ( isNaN(repl) ) {
          // TODO : throw
          alert ("controlPortSendDataFromTextInput: commandAndType.positionToReplaceWithTextInputBaseZero failed parseInt!");
          return;
        }
        // The parent most div id can be found based on the button id
        // and thus only text input field can thus be found
        // or we are handed a p object with child range ...
        var ti;
        var val;

        ti = $(button).find('input[id^="range"]');

        if ( ti.length > 0 ) {
          val = parseInt(ti.val());
        } else {
          var tiId = $(button).prop("id").replace("button","div");
          ti = $("#"+tiId).find("input[type='text']");
          val = parseInt( $(ti).val() );
        }
        if ( isNaN(val) ) {
          // TODO - throw
          alert ("controlPortSendDataFromTextInput: textInput:\r\n" + $(ti).val() + "\r\nain't working as parseInt -- Looks like it's not a number that can be parsed to in integer.");
          // TODO - how to actively reset this so the cleared programmatic value actually becomes visible?
          // Something simple I'm missing here ...
          //$(ti).attr('value', '1').trigger("change").trigger("click"); // Still doesn't show in DOM/UI yet
          //M.updateTextFields(); // Still not
          //$(ti).removeAttr('value'); // Still not
          //alert($(ti).val());
          return;
        }
        cmdarr[repl] = val; // replace the command position with the text input value
        // TODO range validation?
        console.log("controlPortSendDataFromTextInput: " + cmdarr);
        cport.write(cmdarr, function (err) {
          if ( err ) {
            console.log('sprenderer: error on write within controlPortSendData: ', err.message)
          }
        });
        break;

      case "hexCsvBytesChained":
        alert("hexCsvBytesChained for controlPortSendDataFromTextInput not yet implemented! returning ...");
        return;

        var delayBwCalls = parseInt(commandAndType.chainedCmdDelayMs);
        var responseTimeout = parseInt(commandAndType.chainedCmdTimeoutMs);
        var responseTermChar = commandAndType.chainedCmdCompleteChar;
        if ( delayBwCalls ) {
          // Use
          var totTimeout = 0;
          var len = commandAndType.value.length;
          console.log("hexCsvBytesChained: " + len + " commands found ...");
          commandAndType.value.forEach ( function (catv, index) {
            var cmd = catv.replace(/\s/g,"").split(',');
            var cmdarr = [];
            cmd.forEach(function(c) {
              cmdarr.push(parseInt(c));
            });
            setTimeout( function () {
              console.log("Firing command " + (index + 1) + " of " + len);
              console.log(cmdarr);
              cport.write(cmdarr, function (err) {
                if ( err ) {
                  console.log('sprenderer: error on write within controlPortSendData: ', err.message)
                }
              });
            }, totTimeout, index, len, cmdarr);
            totTimeout += delayBwCalls;
            console.log("Total timeout: " + totTimeout);
          });
        } else
        if ( !delayBwCalls && ( responseTimeout && responseTermChar ) ) {
          // Is arguments.callee.name deprecated or not?
          console.log(arguments.callee.name + ": hexCsvBytesChained with sequenced cmds issued and termination of each stage based on response termination character or response timeout");
          // See above - parsers requires a new serialport
          //const parser = port.pipe(new Delimiter({ delimiter: '\n'}));
          //parser.on('data', console.log);
        }
        break;
        // End case: hexCsvBytesChained

      default:
        console.log('sprenderer: error on controlPortSendData: type in command with type is not (yet) supported: ' + commandAndType.type);
    }



  } else {  // if not port ...
    console.log ('sprenderer: error on controlPortSendData: port does not yet exist or has not been opened');
  }

}





module.exports = {
  serialOpenByName: serialOpenByName,
  serialClose: serialClose,
  controlPortClose: controlPortClose,
  controlPortOpen: controlPortOpen,
  controlPortSendStuff: controlPortSendStuff,
  serialTestWrite: serialTestWrite,
  serialSendData: serialSendData,
  controlPortSendData: controlPortSendData,
  controlPortSendDataFromTextInput: controlPortSendDataFromTextInput,
  serialCheckbox: serialCheckbox,
  beginSerialComms: beginSerialComms,
  btnDataPortClick: btnDataPortClick,
  btnControlPortClick: btnControlPortClick,
  cancelCustomControlButtonCommand: cancelCustomControlButtonCommand,
};
