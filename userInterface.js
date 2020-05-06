// interface.js
// At this current first draft, this file
// ASSUMES called from this specific mainWindow.html in this project
// TODO move entire construction of the section here? Or to template?
// TODO create object and pass parent div?


const captDataEmitter = require('./capture-data.js').CaptDataEmitter; // For subscribing to events




// Consts
// From prefs implementation
const useRegular = 'regular';
const useDataCaptureFocused = 'dataCaptureFocused';
const uiDataCaptureFocusedHtmlSnippetFilepath = "./userInterfaceDataCaptureFocused.html";



// Variables here are NOT unique to an object instance





// ES6
class UserInterface {

  constructor ({

    // default constructor parameters/properties
    uiRegularDivs = ['#singleWaveformChartAccordion', '#multiWaveformChartAccordion'],
    uiDataCaptureFocusedParentDiv = '#capture_ui'

  } = {}) {

    // Any variables (properties) here, if attached to the "this", ie this object
    // are publicly accessible but unique to this instance
    // And are separated only semantically by "_" as intended to used
    // publicly or privately
    this._uiRegularDivs = uiRegularDivs;
    this._uiDataCaptureFocusedParentDiv = $(uiDataCaptureFocusedParentDiv);

    // Not constructed:
    this._captureDataFileOutputDirectory = null;
    this._buttonsJson = null;


    captDataEmitter.on('captureDataNewFile', (data) => {
      let e = $('#capture_ui_current_filename');
      e.text(data);
      e.addClass('pulse-div');
      setTimeout(
        function () {
          $('#capture_ui_current_filename').removeClass('pulse-div');
        }, 2000
      );
    });


  } // end of constructor


  get captureDataFileOutputDirectory() {
    return this._captureDataFileOutputDirectory;
  }

  get buttonsJson () {
    return this._buttonsJson;
  }

  set captureDataFileOutputDirectory (dir) {
    this._captureDataFileOutputDirectory = dir;
  }

  set buttonsJson (js) {
    this._buttonsJson = js;
  }



  SwitchInterface ( uiInterface ) {

    switch ( uiInterface ) {
      case useRegular:
        this._uiDataCaptureFocusedParentDiv.addClass("hide");
        this._uiRegularDivs.map(function(d){$(d).collapsible("open")});
        this._uiDataCaptureFocusedParentDiv.empty();
        break;
      case useDataCaptureFocused:
        if ( this._uiDataCaptureFocusedParentDiv.children("div").length < 1 ) {
            var json = this.buttonsJson;
            // 2nd param is callback function on completion
            this._uiDataCaptureFocusedParentDiv.load(uiDataCaptureFocusedHtmlSnippetFilepath, this.afterHtmlLoadedCallback(json));
        }
        this._uiDataCaptureFocusedParentDiv.removeClass("hide");
        this._uiRegularDivs.map(function(d){$(d).collapsible("close")});
        break;
      default:
        console.log(`uiInterface case: ${uiInterface} not handled.`);
    } // end of switch

  } // End of: SwitchInterface








  afterHtmlLoadedCallback (addlParam) {
    // We stack in the extra param value here and return the expected callback
    // signature because otherwise the addlParam (eg json) gets lost due to lost
    // this. context

    // this. works here, but you won't be able to access the added html here
    //this.addOnClickFunctionsToDataCaptureFocused();
    return function ( htmlResult, status, xhr ) {
      // this. doesn't work here, and these functions use arrow notation outside
      // of the class
      addButtonLogicFromJson(addlParam);
      addOnClickFunctionsToDataCaptureFocused();
    }
  } // End of: afterHtmlLoadedCallback








  Load ( uiInterface, buttonsJson ) {

    this.buttonsJson = buttonsJson;
    this.SwitchInterface(uiInterface);

  } // End of: Load









} // End of : class UserInterface





//
// Add functions that access the unique, semantically-only-private-by-intention
// but not in reality, properties
//



// This is here and exported as well because
// we need it in cases where the reference to this is otherwise lost
// when for example this function is called in the added click event
// that calls Directory Select Click
// Arrow function auto-creates reference to "this"
EnableCaptureButtons = () => {

  var d = $(document);

  [
    '#btnFilesWritten',
    '#btnWarnings',
    '#btnErrors'

    , '#btnCaptureStart'
    , '#btnCaptureStop'
  ].map( function(i) {
    d.find( $(i) ).removeClass('disabled');
  });

  $('#filesWrittenBadge').removeClass('grey').addClass('blue lighten-2')

} // End of: enableCaptureButtons







DirectorySelectClick = (event) => {

  var captureDataFileOutputDirectory = dialog.showOpenDialog( {
    title : 'Select and/or create your captured data directory ...',
    buttonLabel: 'Start Capture to this Directory',
    properties: [ 'openDirectory', 'createDirectory']
  });

  if ( captureDataFileOutputDirectory ) {
    // This below actually does nothing, the way that this function is defined
    // and used -- because it loses scope of the originating this
    this.captureDataFileOutputDirectory = captureDataFileOutputDirectory;
    $('#labelForSelectOutputDirectory').empty();  // clear the label
    $('#selectOutputDirectory').val(this.captureDataFileOutputDirectory);

    // When the click event is added, at the moment, as coded,
    // we lose reference to this, so we don't call or define or use
    // this . enable Capture Buttons
    EnableCaptureButtons();
    $('#capture_ui_directory_select').removeClass("pulse-div");

    // Re-add the buttons logic with the updated capture Data File Output Directory
    //addButtonLogicFromJson();
  }

} // End of: DirectorySelectClick








addButtonLogicFromJson = ( jsonButtons ) => {

  jsonButtons.map( function(jb) {
    var b = $(document).find("#" + jb.mapToButtonId);
    if ( b ) {
      console.log(`Adding logic from json button to id ${jb.mapToButtonId} for button ${b.attr("id")}`);
      b
        .prop('title', jb.description)
        .click(function() {
          var d = $('#capture_ui_directory_select').find("input").val();
          controlPortSendData(jb.command, jb.returnDataTo, jb, d );
        });
    }
  });

} // End of: addButtonLogicFromJson









addOnClickFunctionsToDataCaptureFocused = () => {

  $('#capture_ui_directory_select.row').click( function(event) {
    DirectorySelectClick(event);
  });

} // End of: addOnClickFunctionsToDataCaptureFocused

















UserInterface.Ready = () => {
  // TODO check current UI selection - move above check about
  // the doc being filled with this content
  // and then conditional adjust this ... otherwise of course
  // an error will be gen'd as this div won't exist
  $('#capture_ui_directory_select').addClass("pulse-div");
  $('#capture_ui_current_filename').show().text("No output file created yet ... this will show after STARTing acquisition ...");
}








module.exports = {

  // Constants

  // Functions to be accessed from other modules
  EnableCaptureButtons,
  DirectorySelectClick,

  // Classes
  UserInterface
};
