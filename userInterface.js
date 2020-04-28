// interface.js
// At this current first draft, this file
// ASSUMES called from this specific mainWindow.html in this project
// TODO move entire construction of the section here? Or to template?
// TODO create object and pass parent div?




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
    this.captureDataFileOutputDirectory = null;

  } // end of constructor







  SwitchInterface ( uiInterface ) {

    switch ( uiInterface ) {
      case useRegular:
        this._uiDataCaptureFocusedParentDiv.addClass("hide");
        this._uiRegularDivs.map(function(d){$(d).collapsible("open")});
        this._uiDataCaptureFocusedParentDiv.empty();
        break;
      case useDataCaptureFocused:
        if ( this._uiDataCaptureFocusedParentDiv.children("div").length < 1 ) {
          this._uiDataCaptureFocusedParentDiv.load(uiDataCaptureFocusedHtmlSnippetFilepath);
        }
        this._uiDataCaptureFocusedParentDiv.removeClass("hide");
        this._uiRegularDivs.map(function(d){$(d).collapsible("close")});
        this.addOnClickFunctionsToDataCaptureFocused();
        break;
      default:
        console.log(`uiInterface case: ${uiInterface} not handled.`);
    } // end of switch

  } // End of: SwitchInterface








  addOnClickFunctionsToDataCaptureFocused () {

    $(document).unbind('click');
    $(document).on('click', '#capture_ui_directory_select', this.DirectorySelectClick);

  } // End of: addOnClickFunctionsToDataCaptureFocused





  // TODO need to draw focus to the directory selection box
  // once the serial ports are selected and opened and we're ready for the
  // next step 




  DirectorySelectClick () {

    var captureDataFileOutputDirectory = dialog.showOpenDialog( {
      title : 'Select and/or create your captured data directory ...',
      buttonLabel: 'Start Capture to this Directory',
      properties: [ 'openDirectory', 'createDirectory']
    });

    if ( captureDataFileOutputDirectory ) {
      this.captureDataFileOutputDirectory = captureDataFileOutputDirectory;
      $('#labelForSelectOutputDirectory').empty();  // clear the label
      $('#selectOutputDirectory').val(this.captureDataFileOutputDirectory);

      // When the click event is added, at the moment, as coded,
      // we lose reference to this, so we don't call or define or use
      // this . enable Capture Buttons
      EnableCaptureButtons();
    }

  } // End of: DirectorySelectClick



  // TODO if capture started, disable other buttons as needed







  Load ( uiInterface ) {
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
EnableCaptureButtons = () => {

  var d = $(document);

  [
    '#btnFilesWritten',
    '#btnWarnings',
    '#btnErrors',

    '#btnCaptureStart',
    '#btnCaptureStop'
  ].map( function(i) {
    d.find( $(i) ).removeClass('disabled');
  });

  $('#filesWrittenBadge').removeClass('grey').addClass('blue lighten-2')

} // End of: enableCaptureButtons





module.exports = {

  // Constants

  // Functions
  EnableCaptureButtons,

  // Classes
  UserInterface
};
