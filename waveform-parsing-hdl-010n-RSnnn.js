
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

var findSofPair = ( buf, startIndex, startingScanNum ) => {

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
    var sofStopSeqMatchIndex = buf.indexOf(sofStopSeq, startIndex);
    //console.log("matchIndex: " + matchIndex + " for startIndex: " + startIndex);

    if (
      matchIndex > -1
      && sofStopSeqMatchIndex > -1
      && ( sofStopSeqMatchIndex - matchIndex == sofDeltaStartToStop)
    ) {

      var nextStartIndex = matchIndex + sofSize;
      var matchIndex2 = buf.indexOf(sofStartSeq, nextStartIndex);
      var sofStopSeqMatchIndex2 = buf.indexOf(sofStopSeq, nextStartIndex);

      if (
        matchIndex2 > -1
        && sofStopSeqMatchIndex2 > -1
        && ( sofStopSeqMatchIndex2 - matchIndex2 == sofDeltaStartToStop)
      ) {
        console.log(`raw chan byte: ${buf[matchIndex + channelNumIndex]}`);
        console.log(buf.slice(matchIndex, sofSize));

        var chan = buf[matchIndex + channelNumIndex] + channelNumIndexBaseAddend;

        var scan = chan == chanAddedBaseAtWhichToIncrementScanNum ? startingScanNum + 1 : startingScanNum;
        //console.log("matchIndex2: " + matchIndex2 + " for next startIndex: " + nextStartIndex);
        return { sof1: matchIndex, sof2: matchIndex2, chan: chan, scan: scan };
      }
    }

    if ( buf.length > warningThresholdBufMult * fullWfSizeInclSof ) {
      console.warn("Warning: waveform-parsing-hdl-010n-RSnnn.js: buffer size is very large yet two SOFs have not been located.  This will rapidly become a problem eating up memory with time-consuming searches.");
    }

    // TODO also somewhere in here warn if the delta between SOFs does not
    // equal the intended waveform data length

  } // end of if buf is large enough to start looking for >= 2 SOFs

  return null;

//} catch (e) {
//  console.error(`findSofs: error: ${e}`);
//}

} // End of: findSofPair









var extractSofBoundsSets = ( rawDataBuffer, startingScanNum ) => {

  let diArr = [];

  //console.log(`extractSofBoundsSets inbuf len: ${rawDataBuffer.length}`);

  var stillGood = true;
  var startIndex = 0;
  while ( stillGood ) {
    var res = findSofPair(rawDataBuffer, startIndex, startingScanNum);
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







const hdlSlope = (1.024 / 255.0);
const hdlOffset = -0.512;

 var valToScaledFloat = ( val ) => {
   //console.log(val);
   let res = parseFloat( hdlSlope * parseFloat(val) + hdlOffset );
   //console.log(res);
   return res;

 } // End of: valToCScaledFloat







module.exports = {
  extractSofBoundsSets,
  lengthOfSof,
  valToScaledFloat
};
