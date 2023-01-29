/* 

audioControl.js 

- require from code/module that already has jquery etc. as needed

*/

const electron = require('electron');
const {ipcRenderer } = electron;
const audioFdbk = require('./audioFdbk.js');




const unmutedSrc = "./assets/icon-unmuted-audio-50-wh.png";
const unmutedAlt = "Audio (Unmuted)";
const unmutedTitle = "CLICK TO MUTE (TURN OFF) AUDIO";
const mutedSrc = "./assets/icon-muted-audio-50-wh.png";
const mutedAlt = "No Audio (Muted)";
const mutedTitle = "CLICK TO UN-MUTE (TURN ON) AUDIO";




module.exports = {

    // TODO extract and make function
    // TODO fix the class name of the img here 
    // TODO tomo - need selector like:
    // $('#sound-control > img.class').attr('src') for example
    // or maybe add [0] or whatever to get the .src attribute - but it shows whole 
    // file url - so maybe not
    // Also add to popout 
    // Also add title to icon too and swap it 
    // domFileAudioControl:




    SetMuteStateFromPrefs: function ( prefs, imgEle) {

        if ( !imgEle || !prefs || !prefs.soundMutedState ) {
          console.warn (`got SetMuteStateFromPrefs with some null input.`);
          return;
        }

        if ( 
            typeof jQuery === 'function' &&
            imgEle instanceof jQuery ) {
                var imgEle = imgEle[0];
                // https://learn.jquery.com/using-jquery-core/faq/how-do-i-pull-a-native-dom-element-from-a-jquery-object/
        }

        setImgItems ( imgEle, prefs.soundMutedState === 'muted' ); // true = yes set to muted
        audioFdbk.SetSoundMutedState( prefs.soundMutedState );

    }, // end of: SetMuteStateFromPrefs




    onSoundControlClick: function ( e ) {

      let isUnmuted = e.target.src.includes("unmuted");

      // if isUnmuted, go to muted and swap the img 
      if ( isUnmuted ) {

        // 1. update pref 
        ipcRenderer.send('prefs:set', {
            'key': 'soundMutedState', 'value': 'muted'
        });
        // 2. swap the icon 
        setImgItems( e.target, true);
        // 3. update the global or big WF graph or whatever and/or the audioFdbk module
        audioFdbk.SetSoundMutedState('muted');

      } else {

        ipcRenderer.send('prefs:set', {
          'key': 'soundMutedState', 'value': 'unmuted'
        });
        setImgItems( e.target, false );
        audioFdbk.SetSoundMutedState('unmuted');

      }      

    } // end of: onSoundControlClick
    



}; // end of: module.exports




let setImgItems = function ( imgEleDom, yesMakeMuted ) {

  if ( !yesMakeMuted ) {
    imgEleDom.src = unmutedSrc; 
    imgEleDom.alt = unmutedAlt; 
    imgEleDom.title = unmutedTitle;
  } else {
    imgEleDom.src = mutedSrc; 
    imgEleDom.alt = mutedAlt;
    imgEleDom.title = mutedTitle;
  }

}