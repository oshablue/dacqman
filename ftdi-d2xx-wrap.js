//
// ftdi-d2xx-wrap.js
//
// Playing around: Is it possible to wrap up an ftdi-d2xx device 
// and add the on data events for example in a separate worker 
// without too much bogging?
//
// See also:
// - https://github.com/thomaschaaf/node-ftdi
// - https://github.com/ArcherGu/ftdi-d2xx
// - https://github.com/motla/ftdi-d2xx
// - https://stackoverflow.com/questions/8898399/node-js-inheriting-from-eventemitter
//


const maxBufferLen = Math.pow(2,16);
const pollingIntervalMs = 40;   // TODO add to constructor and/or get/set etc.


const EventEmitter = require('events');
const Ftdi = require('ftdi-d2xx');



class FtdiDeviceWrapped extends EventEmitter {

  constructor(serialNumber) {
    //console.log(Ftdi);
    super();
    this.FtdiSerialNumber = serialNumber;
    // TODO verify exists and is openable
    this.fd = null; // ???
  }

  // Next item is same as MyClass.prototype.open = function() { ... }
  // open() {
  //   try {
  //     if ( this.fd && this.fd.is_connected ) {
  //       console.warn( `${this.FtdiSerialNumber} is already open (is_connected === true)`);
  //       return;
  //     }

  //     Ftdi.openDevice(this.FtdiSerialNumber)
  //       .then( (promised_FTDI_Device) => {
  //         console.log("then for the FTDI openDevice");
  //         this.fd = promised_FTDI_Device; 
  //         if ( this.fd.is_connected ) { // TODO is_open?
  //           this.emit('open', `${this.FtdiSerialNumber} is connected`);
  //         }
  //       })
  //       .catch( e => console.error(e));

  //   } catch (e) {
  //     console.log(e);
  //   }
  // } // end of: open()

} // end of: FtdiDeviceWrapped


// https://stackoverflow.com/questions/1635116/javascript-class-method-vs-class-prototype-method
FtdiDeviceWrapped.prototype.open = function() {
//FtdiDeviceWrapped.prototype.open = () => { // no! not with this. etc
  try {
    if ( this.fd && this.fd.is_connected ) {
      console.warn( `${this.FtdiSerialNumber} is already open (is_connected === true)`);
      return;
    }

    Ftdi.openDevice(this.FtdiSerialNumber)
      .then( (promised_FTDI_Device) => {
        console.log("then for the FTDI openDevice");
        this.fd = promised_FTDI_Device; 
        if ( this.fd.is_connected ) { // TODO is_open?
          this.emit('open', `${this.FtdiSerialNumber} is connected`);
        }
        setInterval(this.pollDumb.bind(this), pollingIntervalMs);
      })
      .catch( e => console.error(e));

  } catch (e) {
    console.log(e);
  }
} // end of: public instance method: open()





FtdiDeviceWrapped.prototype.pollDumb = function() {
  if ( this.fd && this.fd.is_connected ) {
    //if ( this.fd.status.events.rxchar ) { // this doesn't function as needed
    let len = this.fd.status.rx_queue_bytes;
    if ( len > 0 ) {
      //console.log(len);
      this.fd.read(len)
      .then ( data => {
        if ( data ) {
          this.emit('data', data)
        }
      });
    }
    if ( len >= maxBufferLen ) {
      this.emit('error', {
        "type": "BufferOverflow", // TODO does this yet warrant custom errors?
        "message": `Max Buf Len reached for FTDI rx_queue_bytes ${maxBufferLen}`
      });
    }
    //}
  }
}






FtdiDeviceWrapped.prototype.close = function() {
  //FtdiDeviceWrapped.prototype.open = () => { // no! not with this. etc
    try {

      if ( !this.fd ) {
        console.warn( `this.fd is not anything so it can't be closed`);
      }

      if ( this.fd && !this.fd.is_connected ) {
        console.warn( `${this.FtdiSerialNumber} is already closed (is_connected === false)`);
        return;
      }

      this.fd.close()
        .then( () => {
          this.fd = null;
          this.emit('close', {});
        })
        .catch( e=> console.error(e));
  
    } catch (e) {
      console.log(e);
    }
  } // end of: public instance method: close()






module.exports = {
  FtdiDeviceWrapped: FtdiDeviceWrapped
}