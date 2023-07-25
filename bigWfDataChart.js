// References (oh, so many):
//
// D3 V4 API Reference, example page section for zoom:
// https://d3js.org/d3-zoom#zoom-events
// https://d3js.org/api
//
//
// Lovely tutorial:
// https://www.dashingd3js.com/creating-svg-elements-based-on-data
// Additional lovely references:
// https://github.com/bignerdranch/music-frequency-d3/blob/master/app.js
// https://www.bignerdranch.com/blog/music-visualization-with-d3-js/
// http://square.github.io/crossfilter/
// http://christopheviau.com/d3list/gallery.html
// https://stackoverflow.com/questions/18244995/d3-how-to-show-large-dataset
// https://ff.cx/banksafe/
// https://www.developer.com/java/fun-with-d3.js-data-visualization-eye-candy-with-streaming-json.html
// https://bl.ocks.org/boeric/6a83de20f780b42fadb9
// https://www.freecodecamp.org/news/d3-and-canvas-in-3-steps-8505c8b27444/
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData
// https://developer.mozilla.org/en-US/docs/Web/API/Window/cancelAnimationFrame
// https://stackoverflow.com/questions/13230487/converting-a-buffer-into-a-readablestream-in-node-js
// https://github.com/samcday/node-stream-buffer
// https://nodejs.org/api/stream.html
// https://www.npmjs.com/package/stream-buffers
//
// Excellent d3 zoom how-to type of manual along with svg vs canvas (or mixed)
// https://www.freecodecamp.org/news/get-ready-to-zoom-and-pan-like-a-pro-after-reading-this-in-depth-tutorial-5d963b0a153e/
// https://github.com/larsvers/Understanding-Zoom/blob/master/zoom_step_01.html
//
// d3 and semantic zoom behavior of the drawn lines:
// https://www.dashingd3js.com/lessons/d3-zoom-for-svg-lines-and-svg-paths-part-two



// Now we convert to an "Object"


// Now we move to npm module rather than mainWindow.html script include
const d3 = require('d3'); // for d3@6



function DataChart({
  parentElementIdName = 'chart',
  chartBuffer = Buffer.alloc(4095,64),
  title = "",
  dataLen = 4095
} = {}) {
  // Default params for ES >= 6 or 2015

  var doRenderLoops = false;
  var freshData = false;

  this._parentElementIdName = parentElementIdName;
  this._reqId = null;
  this._chartBuffer = chartBuffer;
  this._dataLen = dataLen; // 4095;

  //_self = this;

  console.log("New bigWfDataChart for id name: " + this.parentElementIdName);
  console.log(this._chartBuffer.length);

  // For tall graphs, use for 500 chartHeight below, with the .svg-container-tall class instead of .svg-container class
  var chartHeight = 300 //500 // was 300 // The larger height chart aka 500 goes along with the 560px width change in the custom.css until better implemented
  var chartWidth = 900
  var _margin = 20 //50 // temp for current cal testing  //20
  var margin = {top: _margin, right: _margin, bottom: _margin, left: _margin}
    , width = chartWidth - margin.left - margin.right // Use the window's width
    , height = chartHeight - margin.top - margin.bottom; // Use the window's height

  var chartBodyTranslateYTopPadding = 10;

  var strokeWidth = 1;

  // Please See:
  // https://stackoverflow.com/questions/57007378/d3-zoom-and-drag-with-svg-axes-and-canvas-chart
  // As to why we are specifying all three of these below:
  var zoom;
  zoom = d3.zoom()
    .scaleExtent([1, 20])
    // The pair of the next two together is what allows us the sensible
    // implementation of zoom and pan extents:
    //              [[left, top] , [right, bottom]]
    .translateExtent([[0,0],[chartWidth, chartHeight]])
    .extent([[0,0],[chartWidth, chartHeight]])
    .filter(filter)
    .on("zoom", zoomed)
    // could we add like wheelDelta([delta]) here too, explicitly? so far seems about 0.005
    ;





  // The number of datapoints
  //var n = 4095;
  var n;
  n = this._dataLen;

  //
  var xScale;
  xScale = d3.scaleLinear()
      .domain([0, n-1]) // input
      .range([0, width]); // output

  var xAxis;
  xAxis = d3.axisBottom(xScale)
    .ticks(10) 
    .tickSize(-chartHeight)

  //
  var yInputMaxVal = 255;
  var yScale; 
  yScale = d3.scaleLinear()
      .domain([0, yInputMaxVal]) // input
      .range([height, 0]); // output

  var yAxis;
  // https://observablehq.com/@d3/pan-zoom-axes
  // Now we do ticks here for easier axes stick-to-edges zoom
  yAxis = d3.axisLeft(yScale)
    .ticks(10)
    .tickSize(-chartWidth)


  // Y Axis Grid Setup
  //var yAxisGrid = d3.axisLeft(y).tickSize(-chartWidth).tickFormat('').ticks(10);


  // d3 line generator'
  var line;
  line = d3.line()
      .x(function(d, i) { return xScale(i); }) // set the x values for the line generator
      .y(function(d) { return yScale(d); }) // yScale(d.y); }) // set the y values for the line generator
      .curve(d3.curveMonotoneX) // apply smoothing to the line
      ;

  // Add some high freq low amp overlay to test semantic zoom
  // over geometric zoom ...
  var dataset = [];
  var j;
  var big;
  var little;
  for ( j = 0; j < n; j++ ) {
    big = 126 * Math.sin(2*3.14159/n*j*4) + 127;
    little = 2 * Math.sin(2*3.14159/n*j*800+2);
    dataset.push(big + little);
  }




  //var svg = d3.select('#chart')
  var svg;
  var svg = d3.select('#' + parentElementIdName)
    .append("div")
    .classed("svg-container", true)
    .append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 " + chartWidth + " " + chartHeight)
    .classed("svg-content-responsive", true)
    //.call(zoom.on("zoom", zoomed))
    //.call(zoom.on("start", zoomedfilter))
    .call(zoom) // defined above and yes required, enabled the defined zoom defs above
    .on("dblclick.zoom", null)          // cancels double-clicking to zoom
    .on("dblclick", ourDlbClick)

    .append("svg")
    .attr("width", chartWidth) //width + margin.left + margin.right)
    .attr("height", chartHeight) //height + margin.top + margin.bottom)

    .append("g")
    .classed("chartBody", true)
    .attr("transform", "translate(" + (margin.left + margin.right) + "," + chartBodyTranslateYTopPadding + ")") // latter value was 0, but Y top gets cut off
    ;


  // Trying above responsive svg, per:
  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js
  // as well as
  // http://thenewcode.com/744/Make-SVG-Responsive


  // X-axis in a group tag
  const gX = svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis); // Create an axis component with d3.axisBottom

  
  // Y-axis in a group tag
  // Yes, the plain y axis needs to be appended first it seems
  const gY = svg.append("g")
    .attr("class", "y axis")
    //.attr("transform", "translate(0,0)") // added for trying to get y axis to track with zoom instead of going off screen eg
    .call(yAxis); // Create an axis component with d3.axisLeft

    // ***
    // TODO TO TEST - alternately could try to implement like minor gridlines too 
    // as another Y axis and then in the zoom function(s) just scale and re-add both (?)
    // ***

  // Below was old method for creating minor and major gridlines 
  // but it complicates the zoom and keep axes with the edges thing - so we move 
  // to adding ticks in the y axis def
  // svg.append("g")
  //   .attr("class", "y axis-grid-minor")
  //   .call(yAxis.tickSize(-chartWidth).tickFormat('').ticks(255/5));
  
  // svg.append("g")
  //   .attr("class", "y axis-grid-major")
  //   .call(yAxis.tickSize(-chartWidth).tickFormat('').ticks(10));



  // Title
  // It turned out a lot easier for our purposes to do this at the main
  // function calling level, building it into the DOM elsewhere ...
  /*svg.append("text")
        .attr("x", (width / 2))
        .attr("y", 15) // 0 - (margin.top / 2))
        .attr("text-anchor", "middle")
        .style("font-size", "1em")
        //.style("text-decoration", "underline")
        .classed("chart-title", true)
        .text(title);
        */
  // Actually we'll do the title as a y-axis thing
  /*svg.append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    //.attr("y", 6)
    //.attr("y", 0 - height/2)
    .attr("dy", "-2em")
    .attr("transform", "rotate(-90)")
    .attr("class", "dataChart-title")
    .text(title);
    */

  // Data line in a path tag
  svg.append("path")
      .datum(dataset)
      .attr("class", "line")
      .attr("d", line)
      .style("stroke-width", strokeWidth)
      ;




  this.RebuildChart = function() {
    rebuildChart();
  }



  let rebuildChart = () => { // was function rebuildChart(that) {}

    //var xScale;
    //that.n = that.dataLen;
    //n = that._dataLen;
    n = this._dataLen;
    xScale = d3.scaleLinear()
        .domain([0, n-1]) // input
        .range([0, width]); // output

    //
    var yInputMaxVal = 255;
    //var yScale; 
    yScale = d3.scaleLinear()
        .domain([0, yInputMaxVal]) // input
        .range([height, 0]); // output

    // Y Axis Grid Setup
    //var yAxisGrid = d3.axisLeft(y).tickSize(-chartWidth).tickFormat('').ticks(10);


    // d3 line generator
    // line = d3.line()
    //     .x(function(d, i) { return xScale(i); }) // set the x values for the line generator
    //     .y(function(d) { return yScale(d); }) // yScale(d.y); }) // set the y values for the line generator
    //     .curve(d3.curveMonotoneX) // apply smoothing to the line
    //     ;

    // Add some high freq low amp overlay to test semantic zoom
    // over geometric zoom ...
    console.log("rebuildChart length: " + n);
    //var dataset = [];
    dataset = [];
    var j;
    var big;
    var little;
    for ( j = 0; j < n; j++ ) {
      big = 126 * Math.sin(2*3.14159/2500.*j*4) + 127; // n => 2500 to add cycles to 4095 from 2500
      little = 2 * Math.sin(2*3.14159/2500.*j*800+2); // same as above
      dataset.push(big + little);
    }
    console.log("dataset len " + dataset.length );


    //svg = d3.select('#' + parentElementIdName)
    // .append("div")
    // .classed("svg-container", true)
    // .append("svg")
    // .attr("preserveAspectRatio", "xMinYMin meet")
    // .attr("viewBox", "0 0 " + chartWidth + " " + chartHeight)
    // .classed("svg-content-responsive", true)
    // .call(zoom.on("zoom", zoomed))
    // .on("dblclick.zoom", null)          // cancels double-clicking to zoom
    // .on("dblclick", ourDlbClick)

    // .append("svg")
    // .attr("width", chartWidth) //width + margin.left + margin.right)
    // .attr("height", chartHeight) //height + margin.top + margin.bottom)

    // .append("g")
    // .classed("chartBody", true)
    // .attr("transform", "translate(" + (margin.left + margin.right) + "," + 0 + ")")
    // ;

    // X-axis in a group tag
    // svg.append("g")
    // .attr("class", "x axis")
    // .attr("transform", "translate(0," + height + ")")
    // .call(d3.axisBottom(xScale)); // Create an axis component with d3.axisBottom
    //svg.selectAll("x axis").call(xScale); //d3.axisBottom().scale(xScale);
    //xScale.domain([0, n-1]);
    //console.log(xScale);
    // wow.
    svg.select("g.x.axis").call(d3.axisBottom().scale(xScale));

    // Y-axis in a group tag
    // svg.append("g")
    //   .attr("class", "y axis-grid-minor")
    //   .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat('').ticks(255/5));
    // svg.append("g")
    //   .attr("class", "y axis-grid-major")
    //   .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat('').ticks(10));

    // svg.append("g")
    //   .attr("class", "y axis")
    //   .call(d3.axisLeft(yScale)); // Create an axis component with d3.axisLeft
    svg.select("g.y.axis").call(d3.axisLeft().scale(yScale));

    // Data line in a path tag
    // svg.append("path")
    // .datum(dataset)
    // .attr("class", "line")
    // .attr("d", line)
    // .style("stroke-width", strokeWidth)
    // ;
    //console.log(dataset);

    svg.selectAll("path.line").remove();
    svg.append("path")
    .datum(dataset)
    .attr("class", "line")
    .attr("d", line)
    //.style("stroke-width", strokeWidth)
    ;

  }



  function ourDlbClick(d) {
    // now to reset on the correct element so after scale reset, there isn't a 
    // jump when a scroll changes an old remaining k != 1
    // This grabs the correct source element
    zoom.scaleTo(d3.select(d.srcElement).transition(500), 1);

    // Prior was:
    // But see note in filter (shift case) and the svg this grabs vs the desired event source svg
    //svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.scale(1));
    
    
    
    //.translate(margin.left + margin.right,0)); // already done in the zoomed() now



    // TODONE WASBUG there is still a bug where after reset, the next (scroll wheel at least)
    // attempt to zoom snaps right back to the last transform/zoom and thus doesn't make
    // any UI sense ...
    // Probably just add some capture and assign?


  }


  // NOTE:
  // https://stackoverflow.com/questions/23430845/holding-shift-prevents-mouse-wheel-zoom-in-firefox
  // we see this indeed - as holding Shift + mouse wheel does not fire any zoom event at all
  // See also:
  // https://github.com/d3/d3/pull/1938
  // I think now we move to d3 as an npm module perhaps?
  //

  var currentTransform;
  function zoomed(e) {
    //console.log(d3.event.translate);  // v3
    //console.log(d3.event.scale);      // v3
    //console.log(d3.event.transform);    // v5
    //currentTransform = d3.event.transform; // v5 
    currentTransform = e.transform; // v6

    console.log(`zoomed e.transform: ${e.transform}`);

    //
    // < Standard XY Zoom >
    // With these two items below, the axes stay where they are relative to the chart 
    // and then all zoom in/out together (axes move out of view / back into view as well)
    // Because we translate the chart above, we should do:
    // This keeps the margins the same on the zoom (prevents the redraw from flushing to the left for example)
    //currentTransform = currentTransform.translate(margin.left + margin.right, chartBodyTranslateYTopPadding);
    // This is for standard xy zoom 
    //svg.attr("transform", currentTransform);
    // </ Standard XY Zoom >
    //

    // Up to here (above) and then the path redraw is all that is needed for 
    // a standard xy zoom

    // d3.event.sourceEvent.nnnKey // v5
    // e.sourceEvent.nnnKey // v6

    // However e.sourceEvent.shiftKey does not work in nodejs 
    // as it is using the chrome browser and see links above about how/why
    // the shift + mouse wheel event is over ridden and thus never triggers 
    // the zoom event here
    // Perhaps there is some other way to catch it.

    // For xy scatter zoom - see example:
    // https://observablehq.com/@d3/x-y-zoom?collection=@d3/d3-zoom
    // https://stackoverflow.com/questions/5802467/prevent-scrolling-of-parent-element-when-inner-element-scroll-position-reaches-t

    // Previous for redo scale on zoom event - actually may not be necessary
    // Yeah - seem not. Only the transform.
    //d3.axisBottom().scale(currentTransform.rescaleX(xScale));
    //d3.axisLeft().scale(currentTransform.rescaleY(yScale));
    // Anyway, maybe this is what was meant:
    // https://d3-graph-gallery.com/graph/interactivity_zoom.html
    // to track the axes with the zooming and redraw so we can see where we are
    // Actually: don't want this (it's already translated as needed (?))
    //currentTransform = currentTransform.translate(margin.left + margin.right, chartBodyTranslateYTopPadding);
    var newX = currentTransform.rescaleX(xScale); // e.transform.rescaleX(xScale);
    var newY = currentTransform.rescaleY(yScale); //e.transform.rescaleY(yScale);
    //svg.select("g.x.axis").call(xAxis.scale(newX));
    //svg.select("g.y.axis").call(yAxis.scale(newY));
    gX.call(xAxis.scale(newX));
    gY.call(yAxis.scale(newY));
    line = d3.line()
      .x(function(d, i) { return newX(i); }) // set the x values for the line generator
      .y(function(d) { return newY(d); }) // yScale(d.y); }) // set the y values for the line generator
      .curve(d3.curveMonotoneX) // apply smoothing to the line
    ;

    // line = d3.line()
    //   .x(function(d, i) { return newX(i); }) // set the x values for the line generator
    //   .y(function(d) { return yScale(d); }) // yScale(d.y); }) // set the y values for the line generator
    //   .curve(d3.curveMonotoneX) // apply smoothing to the line
    // ;

    //gY.call(yAxis.scale(newY));
    // Doesn't seem to do anything:
    //svg.select("y.axis-grid-minor").call(yAxis.tickSize(-chartWidth).tickFormat('').ticks(255/5).scale(newY));
    //svg.select("y.axis-grid-major").call(yAxis.tickSize(-chartWidth).tickFormat('').ticks(10).scale(newY));

    // https://stackoverflow.com/questions/72581298/how-to-zoom-only-on-the-x-axis-in-a-line-chart-in-d3-js-v7

    //svg.selectAll("path.line").attr("d", line);

    // TODO strokeWidth changes for single axis zoom are different and just get really thin and light 
    // eg for x-axis zoom only


    //
    // < X-axis only zoom 
    // For just X-axis:
    /*
    var newX = currentTransform.rescaleX(xScale);
    gX.call(xAxis.scale(newX));
    line = d3.line()
      .x(function(d, i) { return newX(i); }) // set the x values for the line generator
      .y(function(d) { return yScale(d); }) // yScale(d.y); }) // set the y values for the line generator
      .curve(d3.curveMonotoneX) // apply smoothing to the line
    ;
    */
    // </ X-axis only zoom >
    //

    svg.selectAll("path.line")
      .style("stroke-width", strokeWidth ) //  / Math.sqrt(currentTransform.k) ) // strokeWidth now seems to scale ? v6
      .attr("d", line)
      ;


  }


  function filter (event) {
    // Here the shift key while wheel does work like:
    // for example: event.type === "wheel"
    // and event.shiftKey == true
    console.log("d3 filter");

    // From eg:
    // https://observablehq.com/@d3/pan-zoom-axes
    event.preventDefault();

    // return of something is needed to then fire the zoom event:
    // Either of below, and control will continue to the zoomed event
    // but Shift still does not work - ie doesn't show in the e.sourceEvent.shiftKey within zoomed
    //return (!event.ctrlKey || event.type === 'wheel') && !event.button;


    
    if ( event.type === 'wheel' && event.shiftKey ) {
      console.log(`shift + wheel`);
      //svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.scale(1));
      // TODO - call this the right way using the mouse event(s) etc.
      //svg.call(zoom); // TODO this is broken - but it does capture the shift-wheel event in chrome/nodejs
      //svg.call(zoom.scaleBy, )
      // https://observablehq.com/@d3/programmatic-zoom
      // https://github.com/d3/d3-zoom/blob/main/README.md
      // Per API / Source documentation, k is by default specified in our test case where 
      // debug and stop shows that in the zoom function for regular zoom:
      // e.sourceEvent.wheelDeltaY = -4.00024414 ( probably somehow object sizing dependent ) // TODO
      // and e.sourceEvent.deltaMode = 0 = DOM_DELTA_PIXEL
      // so multiply by 0.002 unless ctrlKey and then also multiply by 10
      // and then the transform.k is multiplied by 2^delta
      // so -4. * 0.002 = 0.008 and then 2^.008 = 1.00556 which is exactly the first scale 
      // change from 1 that we see on debug
      // Except here in filter, deltaY is nothing during shift (in chrome presumably)
      // and event.deltaX comes to -40 (and wheelDeltaX is 120) for deltaMode still being 0
      //svg.call(zoom.scaleBy, Math.pow(2, event.deltaX/10. * 0.002));
      //zoom.scaleBy(svg, Math.pow(2, -40)); // event.deltaX/10. * 0.002));

      // here svg is the g.chartBody
      // whereas in the non-shift regular zoom event, the e.sourceEvent.srcElement is actually 
      // svg preserveAspectRatio="xMinYmin meet" viewBox="..." .svg-content-responsive 
      // which is a parent of the svg element here of .chartBody 
      // and this might be why this scaleBy call versus a non-shiftKey zoom event 
      // from the mouseWheel each store a different and separate k value
      // Within the filter handler, event.currentTarget stores the correct xMinYMin target 
      // and so does srcTarget
      //zoom.scaleBy(svg, Math.pow(2, -1.0*event.deltaX/10. * 0.002));
      zoom.scaleBy(d3.select(event.srcElement), Math.pow(2, -1.0*event.deltaX/10. * 0.002));

    } else {
      return ( event.type === 'wheel' && !event.button );
    }


  }


  // function zoomedfilter() {

  //   console.log("zoomedfilter");

  // } // end of zoomedfilter








  // From previous explicit call to update data with provided data set
  // versus using requestAnimationFrame...
  async function update(newdata) {

    svg.selectAll("path.line").remove();
    svg.append("path")
        .datum(newdata) // 10. Binds data to the line
        .attr("class", "line") // Assign a class for styling
        .attr("d", line)
        ;
  } // update





  //var reqId;

  this.RenderChart = function() {
    console.log("this.RenderChart " + this._parentElementIdName);
    doRenderLoops = true;
    renderChart();
  }

  let renderChart = () => {

    try {
      //console.log("doRenderLoops: " + doRenderLoops);
      if ( doRenderLoops === true ) {
        reqId = requestAnimationFrame(renderChart);
        //console.log("reqId for " + parentElementIdName + ": " + reqId);
      }

      if ( freshData === true ) {

        var thisStrokeWidth = strokeWidth;
        if ( currentTransform ) {
          thisStrokeWidth = strokeWidth / currentTransform.k;
        }

        // Get the latest data snapshot
        svg.selectAll("path.line").remove();
        svg.append("path")
          .datum(this._chartBuffer) // if you use this. here, the intended functionality of course breaks due to structure implemented here
          .attr("class", "line")
          .attr("d", line)
          .style("stroke-width", thisStrokeWidth)
          ;

          freshData = false;
          //console.log('freshData = false');

      } // freshData
    } catch ( e ) {
      console.log(this._parentElementIdName + ": Error in renderChart: " + e + " calling cancelRenderChart() ");
      cancelRenderChart();
    }

  }

  // Instead of:
  // DataChart.prototype.CancelRenderChart ...
  // So that we can have private and public style function access
  this.CancelRenderChart = function() {
    console.log("Chart: " + this._parentElementIdName + ": cancelRenderChart req.id: " + reqId);
    doRenderLoops = false;
    cancelRenderChart();
  }

  function cancelRenderChart() {
    //console.log("Chart: " + parentElementIdName + ": cancelRenderChart req.id: " + reqId);
    cancelAnimationFrame(reqId);
    //console.log("cancelAnimationFrame result: " + r)
  }


  // Option in place here:
  // Highlight the chart when new data is added, allowing the last update to
  // fade out within 1000 ms - such that if no new data, chart background
  // fades out
  this.flashColorTimeoutId; //= []; // TODO list / array ???
  let fadeOutMs = 1000;
  let timingMs = 500; // 500 ok for no flash missed for RS8 chan scan
  // was 1000 but in RS8 currently getting every other - haven't debugged yet - is it the 8 chan thing?
  // for DCF mode - or maybe we like the every other - easier on the brain?
  // Ok I think what is happening:
  // class is set for the flash color and the setTimeout is set 
  // the setTimeout starts firing and fading the color out 
  // but it takes long enough that the clearTimeout doesn't stop the fadeOut in progress 
  // so even if the class was added again it gets removed once the fadeout stops - or similar
  // Hence using a shorter time for the setTimeout specific to hardware maybe or just test for 
  // all seems a reasonable solution without getting more complicated 
  // Or even allowing the skip might be easier on the brain.
  // TODO still need to VFY what is happening with Chs 5 - 8 in DCF-UI
  this.UpdateChartBuffer = function(newBuffer) {
    //console.log(`${this._parentElementIdName} ${$('#' + this._parentElementIdName).attr('class')}`)
    //$('#' + this._parentElementIdName).removeClass("flash-color");
    $('#' + this._parentElementIdName).addClass("flash-color");
    if ( this.flashColorTimeoutId ) {
      //this.flashColorTimeoutId.forEach( function(v) {
        //console.log(`clearing flashColorTimeoutId ${this.flashColorTimeoutId}`);
        clearTimeout(this.flashColorTimeoutId);
      //});
      //this.flashColorTimeoutId = [];
      // console.log(`clearing flashColorTimeoutId ${this.flashColorTimeoutId}`);
      // clearTimeout(this.flashColorTimeoutId);
      //$('#' + this._parentElementIdName).removeClass("flash-color"); // testing - in case still there?
    }
    //let tid;
    this.flashColorTimeoutId = setTimeout( () => {
    //tid = setTimeout( () => {
      //console.log(`${this._parentElementIdName} ${$('#' + this._parentElementIdName).attr('class')}`);
      $('#' + this._parentElementIdName).removeClass("flash-color", fadeOutMs) // was 1000 - but add again a little easier on the eyes
    }, timingMs); // was 1000
    //this.flashColorTimeoutId.push(tid);
    //console.log(`flashColorTimeoutId ${this.flashColorTimeoutId}`);
    // Adding 2023 Q1 -- too long?
    if ( this._dataLen > this._chartBuffer.length ) {
      this._chartBuffer = Buffer.alloc(this._dataLen, 64);
    }
    // End of Add
    newBuffer.copy(this._chartBuffer, 0, 0, this._dataLen); // was testing for DLITE at 2400 // TODO hardware dependent --  4096); // was 4096

    //console.log("this._dataLen " + this._dataLen + " for " + this._parentElementIdName);
    //console.log("this._chartBuffer length " + this._chartBuffer.length + " for " + this._parentElementIdName);
    freshData = true;
  } // end of UpdateChartBuffer






  










  this.UpdateChartBufferFloat32 = function(newBufferX, newBufferY) {
    $('#' + this._parentElementIdName).addClass("flash-color");
    if ( this.flashColorTimeoutId ) {
        clearTimeout(this.flashColorTimeoutId);
    }
    this.flashColorTimeoutId = setTimeout( () => {
      $('#' + this._parentElementIdName).removeClass("flash-color", fadeOutMs) // was 1000 - but add again a little easier on the eyes
    }, timingMs);

    this._chartBuffer = new Float32Array(newBufferY);
    this._dataLen = newBufferY.length;

    n = this._dataLen;
    let minx = Math.min(...newBufferX);
    let maxx = Math.max(...newBufferX);
    xScale = d3.scaleLinear()
        .domain([minx, maxx]) // input
        .range([0, width]); // output
    svg.select("g.x.axis").call(d3.axisBottom().scale(xScale))

    let miny = Math.min(...newBufferY);
    let maxy = Math.max(...newBufferY);
    yScale = d3.scaleLinear()
        .domain([miny, maxy]) // input
        .range([height, 0]); // output
    svg.select("g.y.axis").call(d3.axisLeft().scale(yScale));

    freshData = true;

    /**
     * Sample code for other tests of scatter plots:
     * 
    dataSet = [];
    
    // perform calcs, maybe cases for piecewise, and then like:
    // x values calculated / indexed / looped
    // y values scaled output 
    // color set like color = "cyan" etc based on case or gradient thing
    dataSet.push( { x:x, y:y, color:color})
    // arrays indexed by like cnt for the x32 arrays if used separated to scan for min / max
    
    let minx = Math.min(...x32);
    let maxx = Math.max(...x32);
    xScale = d3.scaleLinear()
        .domain([minx, 1.1*maxx]) // input
        .range([0, width]); // output
    svg.select("g.x.axis").call(d3.axisBottom().scale(xScale))

    let miny = Math.min(...y32);
    let maxy = Math.max(...y32);
    yScale = d3.scaleLinear()
        .domain([miny, 1.1*maxy]) // input
        .range([height, 0]); // output
    svg.select("g.y.axis").call(d3.axisLeft().scale(yScale));

    svg.selectAll("path.line").remove();
    svg.selectAll(".dot")
      .data(dataSet)
      .enter()
      .append("circle")
      .attr("cx", function (d) { return xScale(d.x); } )
      .attr("cy", function (d) { return yScale(d.y); } )
      .attr("r", 1)
      .attr("fill", function(d) { return d.color; })
      ;
 



     */

    
  } // end of UpdateChartBufferFloat32












  let perGraphAudioIndicator = $(document.createElement("img"))
      .addClass("sound-indicator")
      .attr("src", "./assets/icon-audio-wave-50-wh.png")
      .attr("alt", "Playing Now")
      ;

  this.soundPlayingTimeoutId; // TODO list / array
  this.ShowPlayingSound = function(timeoutMs) {
    // let i = $(document.createElement("i"))
    // .text("play_circle_filled")
    // .addClass("material-icon")
    // ;
    // let i = $(document.createElement("img"))
    //   .addClass("sound-indicator")
    //   .attr("src", "./assets/icon-audio-wave-50-white.png")
    //   .attr("alt", "Playing Now")
    //   ;
    // <img src="./assets/icon-audio-wave-50.png" width="50" height="50" alt="PLAYING"></img>
    (perGraphAudioIndicator).insertAfter($('#' + this._parentElementIdName).parent().find('span')[0]); // append to the parent Channel label
    
    if ( this.soundPlayingTimeoutId ) {
      clearTimeout(this.soundPlayingTimeoutId);
    }
    this.soundPlayingTimeoutId = setTimeout( () => {
      $('#' + this._parentElementIdName).parent().find('.sound-indicator').remove();
    }, timeoutMs);
  }





  this.UpdateChartLength = function(newLength) {
    console.log("this.UpdateChartLength " + newLength);
    this._dataLen = newLength;
    //this.n = newLength;
    this._chartBuffer = Buffer.alloc(newLength, 64);
    rebuildChart(); // was (this)
  }


} // End of Function constructor DataChart(...)









module.exports = DataChart;
/*module.exports = {
  update: update,
  renderChart: renderChart,
  cancelRenderChart: cancelRenderChart,
};*/
