// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const SerialPort = require('serialport')
const createTable = require('data-table')
var port
var device

var ftdi = require('ftdi');
const electron = require('electron');
const {ipcRenderer} = electron;

// TODO -- static --> and then --> callback structure for correct data destination


SerialPort.list((err, ports) => {
  console.log('ports', ports);
  if (err) {
    document.getElementById('error').textContent = err.message
    return
  } else {
    document.getElementById('error').textContent = ''
  }

  if (ports.length === 0) {
    document.getElementById('error').textContent = 'No ports discovered'
  }

  var headers = Object.keys(ports[0])
  headers.push("selectthisone")
  const table = createTable(headers)
  tableHTML = ''
  table.on('data', data => tableHTML += data)
  table.on('end', () => document.getElementById('ports').innerHTML = tableHTML)
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

// https://serialport.io/docs/en/api-stream
// For driver management on  Mac OS X, see Readme
// Tested with 115200
// After plist update to the right FT2232H_A (?) device ID in the Plist.info
// for the FTDI driver and kextunload and kextreload mapping 300 to 12000000...
// Aliasing seems to be not working
// Direct use of 3,000,000 looks ok - directly as a call
// But can't call with a higher value, and aliasing seems to do nothing
var serialOpenByName = function (name) {

  //port = new SerialPort(name, { autoOpen: false, baudRate: 3000000 }, function (err) {
  var settings = {
    autoOpen: false,
    baudRate: 57600, //921600, //57600,
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
      }, 2000);
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

var buf = [];
var nsamp = 4096;
var filling = false;

/*var serialOpenByName = function (name) {

  port = new ftdi.FtdiDevice(0); // for d2xx only

  //ftdi.find( function(err, devices) {
  //  port = new ftdi.FtdiDevice(devices[0]);

    port.on('error', function(err) {
      console.log('port.on error: ', err);
    });
    port.on('open', function(err) {
      console.log('port.on open');
    });
    port.on('data', function (data) {
      console.log ("port.on data");
      //if ( data.length > 3000 ) {  // just testing - so would like to see a large sample
      if ( !filling ) {
        setTimeout(function() {
          mainWindowUpdateChartData(buf);
          buf = [];
          filling = false;
        }, 2000);
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
    var settings = {
      baudrate: 57600,
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
*/

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

var serialTestWrite = function () {
  if ( port ) {
    /*var size = 10;
    var buffer = new Buffer(size);
    var i = 0;
    for (i=0; i<size; i++) {
      buffer[i] = 0xaa;
    }*/
    var cmd = [ 0x53, 0xC4, 0x01, 0x00, 0x50 ];
    //port.write('Testing123', function (err) {
    //port.write(buf, function (err) {
    port.write(cmd, function (err) {
      if ( err ) {
        console.log('sprenderer: error on write: ', err.message)
      }
    });
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
        break;

      default:
        console.log('sprenderer: error on serialSendData: type in command with type is not (yet) supported: ' + commandAndType.type);
    }

    port.write(cmdarr, function (err) {
      if ( err ) {
        console.log('sprenderer: error on write within serialSendData: ', err.message)
      }
    });

  } else {  // if not port ...
    console.log ('sprenderer: error on serialSendData: port does not yet exist or has not been opened');
  }

}


module.exports = {
  serialOpenByName: serialOpenByName,
  serialClose: serialClose,
  serialTestWrite: serialTestWrite,
  serialSendData: serialSendData,
};
