'use strict';

// This is like the original nodejs stream buffer at:
// https://github.com/samcday/node-stream-buffer
// And many thanks for this.
//
// Modified however such that at the frequency specified,
// data is not always emitted, only when there is sufficient data available
// in the internal buffer to be able to emit a chunk of the specific size.
// Prior, if chunk size were large enough and frequency small enough, you could
// get a buffer underrun - which is fine in some cases, but not all use cases
// it seemed here.  Thus, by only emitting chunks of the specified size, we
// can grab larger chunks at a lower frequency, for example, and use only one
// portion each time, thus in a way decimating the data (or dropping frames)
// to prevent backpressure from allowing run-away memory with a source rate
// exceeding consumption rate, and also preventing data from jumping around in a
// fixed window without a sync mechanism (like a sync data sequence) which would
// exhaust the source when the source is not guaranteed in its incoming chunksizes,
// only its constant overall rate.  Applied to a serial port data stream from instrumentation
// with real-time graphing, this has worked well.
// So now, this library operates not as OR of frequency or chunksize, but as just
// if sufficient chunk size, then emit the data at the frequency (or next interval,
// for example.
// OB/NKS 2019-12-Dec-14

var stream = require('stream');
//var constants = require('./constants');
var util = require('util');

// From constants.js
//module.exports = {
const constants = {
  DEFAULT_INITIAL_SIZE: (8 * 1024),
  DEFAULT_INCREMENT_AMOUNT: (8 * 1024),
  DEFAULT_FREQUENCY: 1,
  DEFAULT_CHUNK_SIZE: 1024,
};

var ReadableStreamBuffer = module.exports = function(opts) {
  var that = this;
  opts = opts || {};

  stream.Readable.call(this, opts);

  this.stopped = false;

  var frequency = opts.hasOwnProperty('frequency') ? opts.frequency : constants.DEFAULT_FREQUENCY;
  var chunkSize = opts.chunkSize || constants.DEFAULT_CHUNK_SIZE;
  var initialSize = opts.initialSize || constants.DEFAULT_INITIAL_SIZE;
  var incrementAmount = opts.incrementAmount || constants.DEFAULT_INCREMENT_AMOUNT;

  var size = 0;
  var buffer = new Buffer.alloc(initialSize);
  var allowPush = false;

  var sendData = function() {

    var amount = Math.min(chunkSize, size);
    var sendMore = false;

    // edit
    var amountPushed = 0;

    if (amount > 0) {
      var chunk = null;

      if ( !(amount < chunkSize) ) { // edit // amount is chunkSize
        chunk = new Buffer.alloc(chunkSize); //(amount); // or chunkSize, they're the same // unsafe is faster but random contents
        buffer.copy(chunk, 0, 0, chunkSize); //amount); // or ... etc.

        sendMore = that.push(chunk) !== false;
        allowPush = sendMore;

        // We have pushed the chunk so we don't need it
        // amount = chunkSize here
        // So, retain from chunkSize to size - 1
        // source   target  tgtStart  srcStart  srcEnd
        buffer.copy(buffer, 0,        amount,   size);
        size -= amount; // really just subtracting chunkSize
      } // edit
      else {
        //edit
        // amount < chunkSize
        // amount = size
        // retain all of buffer
        buffer.copy(buffer, 0, 0, size);
        // don't subract amount, because nothing has been transferred
      }
      // DONETODO Wait, was this right? Is this where we are losing/gaining a
      // sample originally?
      // Ah, the srcEnd is not inclusive -- thus originally for amount < chunkSize,
      // amount = size and thus nothing is copied -- ok.
      // And, if size = chunkSize, again, nothing copied -- ok.
      // And, if size > chunkSize, amount = chunkSize, size = one beyond last
      // index number to copy, which is correct.
      // source   target  tgtStart  srcStart  srcEnd
      //buffer.copy(buffer, 0,        amount,   size);
      //size -= amount;
    }

    if(size === 0 && that.stopped) {
      that.push(null);
    }

    if (sendMore) {
      sendData.timeout = setTimeout(sendData, frequency);
    }
    else {
      sendData.timeout = null;
    }
  };

  this.stop = function() {
    if (this.stopped) {
      throw new Error('stop() called on already stopped ReadableStreamBuffer');
    }
    this.stopped = true;

    if (size === 0) {
      this.push(null);
    }
  };

  this.size = function() {
    return size;
  };

  this.maxSize = function() {
    return buffer.length;
  };

  var increaseBufferIfNecessary = function(incomingDataSize) {
    if((buffer.length - size) < incomingDataSize) {
      var factor = Math.ceil((incomingDataSize - (buffer.length - size)) / incrementAmount);

      var newBuffer = new Buffer.alloc(buffer.length + (incrementAmount * factor));
      buffer.copy(newBuffer, 0, 0, size);
      buffer = newBuffer;
    }
  };

  var kickSendDataTask = function () {
    if (!sendData.timeout && allowPush) {
      sendData.timeout = setTimeout(sendData, frequency);
    }
  }

  this.put = function(data, encoding) {
    if (that.stopped) {
      throw new Error('Tried to write data to a stopped ReadableStreamBuffer');
    }

    if(Buffer.isBuffer(data)) {
      increaseBufferIfNecessary(data.length);
      data.copy(buffer, size, 0);
      size += data.length;
    }
    else {
      data = data + '';
      var dataSizeInBytes = Buffer.byteLength(data);
      increaseBufferIfNecessary(dataSizeInBytes);
      buffer.write(data, size, encoding || 'utf8');
      size += dataSizeInBytes;
    }

    kickSendDataTask();
  };

  this._read = function() {
    allowPush = true;
    kickSendDataTask();
  };
};

util.inherits(ReadableStreamBuffer, stream.Readable);

module.exports = {
  ReadableStreamBuffer: ReadableStreamBuffer,
};
