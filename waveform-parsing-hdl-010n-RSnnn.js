

// Constants
//
//

const fullWfSizeInclSof = 4095;
const sof = [0xaa, 0x55, 0xaa, 0x55, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0xff, 0x00];
const channelNumIndex = 4;
const channelNumIndexBaseAddend = 1; // channel number in the seq Id byte begins at 0 for the first channel
const sofStartSeq = Buffer.from(sof.slice(0,4)); // slice end is non-inclusive
const sofStopSeq = Buffer.from(sof.slice(8,12));
const sofDeltaStartToStop = 8;
const sofSkipMatchByte = [ 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
const lengthOfSof = sof.length;
const warningThresholdBufMult = 100;
const chanAddedBaseAtWhichToIncrementScanNum = 1;
const warnMaxHardwareChannelBase1 = 8;

// This is the HDL-0108-RSCPT default scan rate
// Each channel is intended to grab 16 WFs per second
// So, 16 x 8 channels = 128 Hz new waveform/sec rate
// Even if only 4 of 8 channels are put to file,
// this is the overall scan rate, so the time to complete
// e.g. a nominal 150 scans per file is based on the same 128 Hz
// This can be used to setup a progress bar in the UI
const nominalWaveformReceiveFrequencyHz = 128;

// HDL-0108-RSCPT Nominal ADC voltage scaling
const hdlSlope = (1.024 / 255.0);
const hdlOffset = -0.512;

//
//
// End of constants



var findSofPair = ( buf, startIndex, startingScanNum, maxScanNumToInclude ) => {

  // Return: {
  //   index of first byte of first start of frame,
  //   index of first byte of second start of frame,
  //   chan: channelNumber,
  //   scan: scanNumber
  // }
  // The distance between should be the waveform data-only section length

  //try {

  var sofSize = lengthOfSof;
  var bufSize = fullWfSizeInclSof;
  var justTheDataSize = bufSize - sofSize;

  // If buf is at least the length of one wf data set plus 2x SOFs
  // as minimum necessary to find two SOFs bracketing a WF data section
  if ( buf.length > (2 * sofSize + justTheDataSize) ) {

    //console.log(sofStartSeq);

    var matchIndex = buf.indexOf(sofStartSeq, startIndex);

    // there could be a sofStopSeq (for example if the parent function to only
    // stream data starting at the first SOF isn't working or etc.)
    // so offset by the first match index for the start
    var sofStopSeqMatchIndex = buf.indexOf(sofStopSeq, matchIndex); //startIndex);
    //console.log("matchIndex: " + matchIndex + " for startIndex: " + startIndex);
    //console.log("sofStopSeqMatchIndex: " + sofStopSeqMatchIndex + " for startIndex: " + startIndex);

    if (
      matchIndex > -1
      && sofStopSeqMatchIndex > -1
      && ( sofStopSeqMatchIndex - matchIndex == sofDeltaStartToStop)
    ) {

      //console.log(`raw chan byte: ${buf[matchIndex + channelNumIndex]}`);
      //let s = buf.slice(matchIndex, 12); //sofSize);
      //console.log(s);

      var nextStartIndex = matchIndex + sofSize;
      var matchIndex2 = buf.indexOf(sofStartSeq, nextStartIndex);
      var sofStopSeqMatchIndex2 = buf.indexOf(sofStopSeq, matchIndex2); //nextStartIndex);

      //console.log("matchIndex2: " + matchIndex2 + " for nextStartIndex: " + nextStartIndex);
      //console.log("sofStopSeqMatchIndex2: " + sofStopSeqMatchIndex2 + " for nextStartIndex: " + nextStartIndex);

      //console.log(`raw chan byte: ${buf[matchIndex + channelNumIndex]}`);
      //console.log(buf.slice(matchIndex, sofSize));

      if (
        matchIndex2 > -1
        && sofStopSeqMatchIndex2 > -1
        && ( sofStopSeqMatchIndex2 - matchIndex2 == sofDeltaStartToStop)
      ) {
        //console.log(`raw chan byte: ${buf[matchIndex + channelNumIndex]}`);
        //console.log(buf.slice(matchIndex, sofSize));

        var chan = buf[matchIndex + channelNumIndex] + channelNumIndexBaseAddend;

        if ( chan > warnMaxHardwareChannelBase1 ) {
          console.warn(`Warning: waveform-parseing-hdl...js: a channel number, ${chan}, larger than the hardware maximum channel number, ${warnMaxHardwareChannelBase1}, was encountered.  This is likely an intrahardware signaling or configuration issue and should be debugged, culminating in a firmware update.`);
        }

        var scan = chan == chanAddedBaseAtWhichToIncrementScanNum ? startingScanNum + 1 : startingScanNum;
        //console.log("matchIndex2: " + matchIndex2 + " for next startIndex: " + nextStartIndex);

        // Now make sure we're not beyond the end of the desired scan capture length
        // If we don't want to lose input data buffer information,
        // the exclude high scan numbers here.
        // If we do want to cut out unused waveforms, like non-channel 1 waveforms
        // in a new file prior to receiving the first channel 1 waveform,
        // then return ok here and exclude in the calling/parent function levels
        // such that that particular data is removed from the parent/full input
        // data buffer
        // Hmmm - we need that last available scan number available in the buffer
        // to trigger the next new file start?
        if ( scan > maxScanNumToInclude ) {
            // this will go to the function's last return statement of nothing/null
            console.log(`scan number ${scan} is greater than max to include - not returning this sof set`);
        } else {
          return { sof1: matchIndex, sof2: matchIndex2, chan: chan, scan: scan };
        }
      }
    }

    if ( buf.length > warningThresholdBufMult * fullWfSizeInclSof ) {
      console.warn("Warning: waveform-parsing-hdl-010n-RSnnn.js: buffer size is very large yet two SOFs have not been located that are within the configured scans per file or channels to use range.  This will rapidly become a problem eating up memory with time-consuming searches.");
    }

    // TODO also somewhere in here warn if the delta between SOFs does not
    // equal the intended waveform data length

  } // end of if buf is large enough to start looking for >= 2 SOFs

  return null;

//} catch (e) {
//  console.error(`findSofs: error: ${e}`);
//}

} // End of: findSofPair









var extractSofBoundsSets = ( rawDataBuffer, startingScanNum, maxScanNumToInclude ) => {

  let diArr = [];

  //console.log(`extractSofBoundsSets inbuf len: ${rawDataBuffer.length}`);

  var stillGood = true;
  var startIndex = 0;
  while ( stillGood ) {
    var res = findSofPair(rawDataBuffer, startIndex, startingScanNum, maxScanNumToInclude );
    if ( res ) {
      diArr.push(res);
      startIndex = res.sof2;
      startingScanNum = res.scan;
    } else {
      stillGood = false; // of just while on nothing and break
    }
  }

  return diArr;

} // End of: extractSofBoundsSets








 var valToScaledFloat = ( val ) => {
   //console.log(val);
   let res = parseFloat( hdlSlope * parseFloat(val) + hdlOffset );
   //console.log(res);
   return res;

 } // End of: valToCScaledFloat







module.exports = {

  // Constants
  lengthOfSof,
  nominalWaveformReceiveFrequencyHz,

  // Functions
  extractSofBoundsSets,
  valToScaledFloat
};
