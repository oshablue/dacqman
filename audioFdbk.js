
// https://www.npmjs.com/package/nodesynth/v/0.6.0

/*
var NodeSynth = require('nodesynth');
require('nodesynth/notes'); // Optional

const sr = 22050;
*/

/*
var ns = new NodeSynth.Synth({bitDepth: 16, sampleRate: sr});
ns.play();



// Sweep up freq
// init example from Readme:
//ns.source = new NodeSynth.Oscillator('sin', function(t){return 440 + ((t * 50) % 220)});
const volEnvFreq = 0.2;
const endTime = (1.0/volEnvFreq);

ns.source = new NodeSynth.Oscillator('sin', function(t){
  let v = 440 + ((t * 500) % (440 * (1/t) ));
  if ( ns.time > endTime ) {    // timeStep is 1/SR
    ns.stop();
  }
  return v;
})
.multiply(new NodeSynth.Oscillator('tri', volEnvFreq).add(1).multiply(0.5));
*/


// Busy signal
/*
var o1 = new NodeSynth.Oscillator('sin', A4);
var o2 = new NodeSynth.Oscillator('sin', B5).multiply(new NodeSynth.Oscillator('sq', 1).add(1).multiply(0.5));
ns.source = o1.mix(o2);
*/

// Harsh single tone
//ns.source = new NodeSynth.Oscillator('sq', A2.perfect_unison());




/*
Using AudioContext - get issues at this version of node/Chrome etc
with not allowing autoplay and needing to handle a user event to unlock
... probably not a bad thing ... no go right now for testing though
*/

//import Envelope from 'envelope-generator';

/*
const Envelope = require('envelope-generator');

let context = new AudioContext();



let osc = context.createOscillator();

let gain = context.createGain();

let env = new Envelope(context, {
  attackTime: 0.1,
  decayTime: 3,
  sustainLevel: 0.4,
  releaseTime: 0.1
});

env.connect(gain.gain);

var startAt = context.currentTime;

var releaseAt = startAt + 0.5;

osc.start(startAt);
env.start(startAt);

env.release(releaseAt);

let stopAt = env.getReleaseCompleteTime();
osc.stop(stopAt);
env.stop(stopAt);
*/









// https://stackoverflow.com/questions/40822969/how-can-i-properly-end-or-destroy-a-speaker-instance-without-getting-illegal-ha
// https://github.com/TooTallNate/node-speaker/issues/18
// On Mac OS X - all of these create that continous buffer underflow dump output!


var Generator = require('audio-generator/stream');
var Speaker = require('audio-speaker/stream');

var PlainSpeaker = require('speaker'); // require('audio-speaker');
//var PlainSpeaker = require('speaker'); ///stream');

const bufferAlloc = require('buffer-alloc');
const Readable = require('stream').Readable;
/*
var generator = require('audio-generator/pull');
var speaker = require('audio-speaker/pull');
var pull = require('pull-stream/pull');

pull(
    generator(Math.random, { duration: 2 }),
    speaker()
);
*/

const EventEmitter = require('events');
class Emitter extends EventEmitter{};
var AudioFdbkEmitter = new Emitter();


// On Win 10 VM 
// so far, writeableHighWater or samplesPerFrame 
// do not effect this new issue (node 12.8.1?)
// where the waveform is not played.
// It seems only sending enough bytes (a full 65536 or 2^16 or so)
// causes the waveform play to fire immediately in Win
// So like need to 4x 4096 buffers then x4 for 2 channels and 2 bytes per sample at 16-bit 
// does it
//


// now we are doing upsampling by 4 so this sr becomes 4x 
// or could be 4x if using original test upping everything by 4 to create large enough 
// data buffer to push something out of the speaker!
let multiple = 1; // 1; // init Win 10 VM - needing 4 to push audio actually out of speaker
let isReady = true;
let sr = 4500*multiple;
let samplesPerBufferIn = 4096;
let samplesToPlay = samplesPerBufferIn * multiple;
let timeoutMs = samplesToPlay * 1.0/sr * 1000;

sr = sr * 4; // see note above about now doing upsample

let soundMutedState = 'unmuted';

let upsample = require('./upsample-custom.js');


let speakerDestroyTimeoutId;
let plainSpeaker;

var playData = function(data) {

  //console.log(isReady);

  if ( !okToPlay() ) {
    return;
  }

  if ( !isReady ) { return; }
  isReady = false; // wait until write data

  // let's now use the drain event responder - nope that ends too soon
  setTimeout(function(){
      isReady = true;
  }, timeoutMs);


  // Below isn't right ... just setting up
  // const stream = new Readable();
  // stream.bitDepth = 16
  // stream.channels = 2
  // stream.sampleRate = 44100
  // stream.samplesGenerated = 0
  // stream._read = read
  // stream.pipe(new PlainSpeaker());



  if ( !plainSpeaker ) {

    // Create the Speaker instance
    // Works when using speaker.write and not the Readabe instance + pipe
    plainSpeaker = new PlainSpeaker({
      channels: 2,
      bitDepth: 16,
      sampleRate: sr // 3000 - 384000
    });

    plainSpeaker.on('open', () => {
      console.log('Speaker open');
    })

    plainSpeaker.on('flush', () => {
      console.log('Speaker flush');
    });

    plainSpeaker.on('close', () => {
      console.log('Speaker close');
      //isReady = true; // nope
    });

    plainSpeaker.on('end', () => {
      console.log('Speaker end');
    });

    plainSpeaker.on('drain', () => {
      //console.log('Speaker drain'); // this one actually does fire at the end of a played buffer
      //isReady = true; // naw that happens too soon
    });

    plainSpeaker.on('finish', () => {
      console.log('Speaker finish');
    });

  } // speaker is not falsy


  // Just rudimentary testing, and this Buffer usage is deprecated still ...
  // Just add 1 sample since incoming data is 4095 bytes
  // TODO method-ize for any not 2n length
  // Values are 0 to 255
  dataByteToLengthIn = Buffer.alloc(samplesPerBufferIn, 0, Uint8Array); // Buffer.concat([new Buffer(1), data]);
  data.copy(dataByteToLengthIn, 0, 0); // last param omitted as default is to copy the whole source
  //data3 = Buffer.from(new Uint16Array(data2));


  // Test values
  // https://github.com/TooTallNate/node-speaker/blob/master/examples/sine.js
  const bitDepth = 16
  const channels = 2
  // For 4095 or 6 samples coming in, at 2B per sample and 2 Chan - 
  // for this algorithm we use 4x because the PCM writing logic for 16-bit divides by 4
  const n = samplesPerBufferIn * 4   
  //const freq = 440.0
  const sampleRate = sr; // versus eg 44100
  //let samplesGenerated = 0;

  const sampleSize = bitDepth / 8             // 2 bytes
  const blockAlign = sampleSize * channels    // 4 bytes
  let numSamples = n / blockAlign | 0       // 4096*4/4 | 0
  let data4 = bufferAlloc(numSamples * blockAlign)    // 4096 * 4
  const amplitude = 32760; // Max amplitude for 16-bit audio

  // the "angle" used in the function, adjusted for the number of
  // channels and sample rate. This value is like the period of the wave.
  //const t = (Math.PI * 2 * freq) / sampleRate

  // Just testing logic for 440 Hz sounding output at selected parameters
  // for (let i = 0; i < numSamples; i++) {
  //   // fill with a simple sine wave at max amplitude
  //   for (let channel = 0; channel < channels; channel++) {
  //     const s = samplesGenerated + i
  //     const val = Math.round(amplitude * Math.sin(t * s)) // sine wave
  //     const offset = (i * sampleSize * channels) + (channel * sampleSize)
  //     data4[`writeInt${bitDepth}LE`](val, offset)
  //   }
  // }

  // Looks like upSample wants Int16Array (TypedArray) input
  // and delivers an Int16Array (TypedArray) output

  let upsampleRatio = 4;
  // Uint8Array (Buffer) needs to be converted to Int16Array (TypedArray) to correctly capture the values as Int16
  let upsampleInput = new Int16Array(dataByteToLengthIn.length);
  for ( let j = 0; j < dataByteToLengthIn.length; j++) {
    upsampleInput[j] = (dataByteToLengthIn[j]/255.0 - 0.5) * amplitude;
  }
  let upsampled = upsample(upsampleInput, upsampleRatio, false); // false => don't do a wave header thing
  //data2 = upsampled;
  data4 = bufferAlloc(numSamples * blockAlign * upsampleRatio); // should default to Buffer type which is Uint8Array
  numSamples *= upsampleRatio;

  let i = 0;
  for (i = 0; i < numSamples; i++) {
    // fill with a simple sine wave at max amplitude
    for (let channel = 0; channel < channels; channel++) {
      //const s = samplesGenerated + i
      //const val = Math.round(amplitude * (data2[i]/255.0-0.5)) // or data2 became dataByteToLengthIn
      //const val = Math.round(amplitude * (upsampled[i]/255.0-0.5)); // prior - not upsampled - not right length now for upsample
      // now upsampled input has been biased to zero for signed input scaled to int16 so upsampled output is already zero biased and scaled
      const val = upsampled[i]; // Math.round(upsampled[i]);      
      let valFaded = i < 100 ? val * i/100 : val;
       valFaded = i > numSamples - 100 ? valFaded * (numSamples - i)/100 : valFaded;
      const offset = (i * sampleSize * channels) + (channel * sampleSize)
      data4[`writeInt${bitDepth}LE`](valFaded, offset)
      //console.log(i)
    }
  }
  //console.log(i);
  //console.log(data4);



  // This works - just a first test - mono? - nope stereo - so samples are interleaved
  // speaker.write(data3, () => {
  //   speaker.destroy(); // close is not a function unless requiring plain old speaker
  //   console.info('Speaker data written');
  // });

  //clearTimeout(speakerDestroyTimeoutId);

  // This works too - sr has a nice big impact on how you hear it etc.
  //plainSpeaker(data4);
  //data4.pipe(plainSpeaker);
  //plainSpeaker.open()
  //data5 = Buffer.concat([data4, data4, data4]);
  //data5 = Buffer.alloc(samplesToPlay * blockAlign, 0, Int16Array);
  //data4.copy(data5, 0, 0); // copy all of data4 aka 4096 into the larger data5
  //isReady = false; // becomes true again after drain responder
  //plainSpeaker.push(data4); //.write(data5, () => {
  //let data6 = Buffer.alloc(data4);
  //let upsampledData = upsample(data4, 4);
  //upsampledData.copy(data5);
  plainSpeaker.write(data4);
  //plainSpeaker.write(Buffer.from(upsampledData));
    //speaker.flush();
    // speakerDestroyTimeoutId = setTimeout( function() {
    //    speaker.destroy(); // close is not a function unless requiring plain old speaker
    //    speaker = null;
    //    console.log('speaker destroyed');
    // }, timeoutMs + 1000);
    //console.info('Speaker data written');
  //   setTimeout( function() {
  //     plainSpeaker.close();
  //   }, 1000)
  //});

  // not working yet
  //stream.push(data4);

}





var playOpen = function() {

  console.warn(
    "As of DacqMan 0.0.11 with included audio examples, audio-generator/stream \
    is used, and on Mac OS X 10.14.n at least, with the use of a generator or speaker \
    you will, after the generator is done, even on speaker close/destroy, etc. \
    get repeated warnings on the command line, looped spam, about buffer underrun, \
    the simplest method, and only working method, is to edit the file in the \
    node_modules/speaker package, coreaudio.c, circa line 81, to comment out the \
    warning message - there are other similar routes. But it means you cannot use \
    the default package.  You may need to npm install -g node-gyp to allow you \
    to then cd node_modules/speaker and node-gyp build to regenerate the bins \
    with this source change. Please see DacqMan source for links to the issue \
    as available and discovered in various relevant packages. Perhaps this will \
    be fixed soon in mpg123 or elsewhere. \
    Path: node_modules/speaker/deps/mpg123/src/output/coreaudio.c circa line 81."
  );

  if ( !okToPlay() ) {
    return;
  }

  let speaker = new Speaker();
  // Never happens btw:
  speaker.on('end', function(){
    console.log("END");
  });
  console.log(speaker);

  // Create the Speaker instance
      // let speaker = new Speaker({
      //   channels: 2,
      //   bitDepth: 16,
      //   sampleRate: 44100
      // });
      //
      // speaker.on('open', () => {
      //   console.debug('Speaker open');
      // })
      //
      // speaker.on('flush', () => {
      //   console.debug('Speaker flush');
      // });
      //
      // speaker.on('close', () => {
      //   console.debug('Speaker close');
      // });


      /*
      speaker.write(Buffer.from(new Uint16Array(100000)), () => {
        speaker.close();
        console.info('Speaker data written');
      });
      */

  var durSec = 10;

  var cf = Math.random() * 120. + 340;
  var dev = Math.random() * 3. + 0.;
  var fmin = cf - dev; // was 439
  var fmax = cf + dev; // was 441
  var vmaxScale = 0.8; // max volume scale 

  let g = Generator(
    //Generator function, returns sample values -1..1 for channels
    function (time) {
        let v = time < 1.0 ? (0.5 * time) : 0.1 / (Math.pow(time, 3));

        v = v > 1.0 ? 1.0 : v;
        return [
            vmaxScale * Math.sin(Math.PI * 2 * time * (fmin + Math.pow(time, 8) ) ) * ( v ), //channel 1
            vmaxScale * Math.sin(Math.PI * 2 * time * (fmax - Math.pow(time, 8) ) ) * ( v ), //channel 2
        ]
    },

    {
        //Duration of generated stream, in seconds, after which stream will end.
        duration: durSec, // Infinity,

        //Periodicity of the time.
        //period: Infinity
    })
    .on('error', function (e) {
        //error happened during generation the frame
        console.log(e);
    })
    .pipe(speaker); //({
      //PCM input format defaults, optional.
        //channels: 2,
        //sampleRate: 22050, // 44100,
        //byteOrder: 'LE',
        //bitDepth: 16,
        //signed: true,
        //float: false,
        //interleaved: true,
    //}));


    setTimeout(function(){

      // only for require('speaker'):
      //speaker.close();

      // Just for testing if this would stop the console warnings about
      // buffer underruns
      speaker.destroy();

    }, durSec*1000);

}






var playPopoutOpen = function() {

  console.warn(
    "As of DacqMan 0.0.11 with included audio examples, audio-generator/stream \
    is used, and on Mac OS X 10.14.n at least, with the use of a generator or speaker \
    you will, after the generator is done, even on speaker close/destroy, etc. \
    get repeated warnings on the command line, looped spam, about buffer underrun, \
    the simplest method, and only working method, is too edit the file in the \
    node_modules/speaker package, coreaudio.c, circa line 81, to comment out the \
    warning message - there are other similar routes. But it means you cannot use \
    the default package.  You may need to npm install -g node-gyp to allow you \
    to then cd node_modules/speaker and node-gyp build to regenerate the bins \
    with this source change. Please see DacqMan source for links to the issue \
    as available and discovered in various relevant packages. Perhaps this will \
    be fixed soon in mpg123 or elsewhere."
  );

  if ( !okToPlay() ) {
    return;
  }

  let speaker = new Speaker();
  // Never happens btw:
  speaker.on('end', function(){
    console.log("END");
  });
  console.log(speaker);

  var durSec = 2;

  var cf = Math.random() * 120. + 840;
  var dev = Math.random() * 3. + 0.;
  var fmin = cf - dev; // was 439
  var fmax = cf + dev; // was 441
  var vmaxScale = 0.8; // max volume scale 

  let g = Generator(
    //Generator function, returns sample values -1..1 for channels
    function (time) {
        let v = time < 1.0 ? (0.5 * time) : 0.1 / (Math.pow(time, 6));

        v = v > 1.0 ? 1.0 : v;
        return [
            vmaxScale * Math.sin(Math.PI * 2 * time * (fmin + Math.pow(time, 12 ) ) ) * ( v ), //channel 1
            vmaxScale * Math.sin(Math.PI * 2 * time * (fmax - Math.pow(time, 12 ) ) ) * ( v ), //channel 2
        ]
    },

    {
        //Duration of generated stream, in seconds, after which stream will end.
        duration: durSec, // Infinity,

        //Periodicity of the time.
        //period: Infinity
    })
    .on('error', function (e) {
        //error happened during generation the frame
        console.log(e);
    })
    .pipe(speaker);


    setTimeout(function(){

      // only for require('speaker'):
      //speaker.close();

      // Just for testing if this would stop the console warnings about
      // buffer underruns
      speaker.destroy();

    }, durSec*1000);

}




let lastChanBase1 = 0;
let chanArray = [];
let chansPlayed = [];
var roundRobbinPlayData = function(chan, data) {
  //console.log(`audio chan ${chan}`);
  //let play = isReady;
  //console.log(`chanArray ${chanArray}`);
  //console.log(`chansPlayed ${chansPlayed}`);
  //console.log(`roundRobbinPlayData isReady: ${isReady}`);
  if ( !chanArray.includes(chan) ) {

    // First gather all the channels in their particular order
    chanArray.push(chan);

  } else { 

    if ( !chansPlayed.includes(chan) ) {

      if ( isNextChan(chan) && isReady ) {
        // play it
        //console.log(`playing next chan ${chan}`);
        playData(data);
        // store it
        AudioFdbkEmitter.emit('audioFdbk:playingSoundForChanNum', {
          "chanNum": chan,
          "timeoutMs": timeoutMs
        })
        chansPlayed.push(chan);
      }

      if ( chansPlayed.length === chanArray.length ) {
        chansPlayed = [];
      }

    }

  }

}


var isNextChan = function(chan) {
  let ret = false;
  if ( chansPlayed.length == 0  && chanArray.indexOf(chan) == 0 ) {
    return true;
  }
  let lastChanPlayed = chansPlayed[chansPlayed.length - 1];

  if ( chanArray.indexOf(chan) - chanArray.indexOf(lastChanPlayed) == 1 ) {
    return true;
  }
  return ret;
}





var reset = function() {
  chanArray = [];
  chansPlayed = [];
  allPlayed = false;
}



var SetSoundMutedState = function (state) {
  soundMutedState = state;
}



var GetSoundMutedState = function() {
  return soundMutedState;
}




var okToPlay = function() {
  return soundMutedState === 'unmuted';
}



module.exports = {
  playOpen: playOpen, // don't include () - this will execute immediately!
  playData: playData,
  playPopoutOpen: playPopoutOpen,
  roundRobbinPlayData: roundRobbinPlayData,
  reset: reset,
  AudioFdbkEmitter: AudioFdbkEmitter,
  SetSoundMutedState: SetSoundMutedState
}
