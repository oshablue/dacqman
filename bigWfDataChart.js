// References (oh, so many):
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



var chartContainer = document.getElementById('chart');



var chartHeight = 300
var chartWidth = 900
var _margin = 20
var margin = {top: _margin, right: _margin, bottom: _margin, left: _margin}
  , width = chartWidth - margin.left - margin.right // Use the window's width
  , height = chartHeight - margin.top - margin.bottom; // Use the window's height

var strokeWidth = 1;

// Please See:
// https://stackoverflow.com/questions/57007378/d3-zoom-and-drag-with-svg-axes-and-canvas-chart
// As to why we are specifying all three of these below:
var zoom = d3.zoom()
  .scaleExtent([1, 20])
  // The pair of the next two together is what allows us the sensible
  // implementation of zoom and pan extents:
  //              [[left, top] , [right, bottom]]
  .translateExtent([[0,0],[chartWidth, chartHeight]])
  .extent([[0,0],[chartWidth, chartHeight]])
  ;



// The number of datapoints
var n = 4095;

//
var xScale = d3.scaleLinear()
    .domain([0, n-1]) // input
    .range([0, width]); // output

//
var yInputMaxVal = 255;
var yScale = d3.scaleLinear()
    .domain([0, yInputMaxVal]) // input
    .range([height, 0]); // output

// d3 line generator
var line = d3.line()
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
for ( j = 0; j < 4095; j++ ) {
  big = 126 * Math.sin(2*3.14159/4095*j*4) + 127;
  little = 2 * Math.sin(2*3.14159/4095*j*800+2);
  dataset.push(big + little);
}




var svg = d3.select('#chart')
  .append("div")
  .classed("svg-container", true)
  .append("svg")
  .attr("preserveAspectRatio", "xMinYMin meet")
  .attr("viewBox", "0 0 " + chartWidth + " " + chartHeight)
  .classed("svg-content-responsive", true)
  .call(zoom.on("zoom", zoomed))
  .on("dblclick.zoom", null)          // cancels double-clicking to zoom
  .on("dblclick", ourDlbClick)

  .append("svg")
  .attr("width", chartWidth) //width + margin.left + margin.right)
  .attr("height", chartHeight) //height + margin.top + margin.bottom)

  .append("g")
  .classed("chartBody", true)
  .attr("transform", "translate(" + (margin.left + margin.right) + "," + 0 + ")")
  ;


// Trying above responsive svg, per:
// https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js
// as well as
// http://thenewcode.com/744/Make-SVG-Responsive


// X-axis in a group tag
svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(xScale)); // Create an axis component with d3.axisBottom

// Y-axis in a group tag
svg.append("g")
    .attr("class", "y axis")
    .call(d3.axisLeft(yScale)); // Create an axis component with d3.axisLeft

// Data line in a path tag
svg.append("path")
    .datum(dataset)
    .attr("class", "line")
    .attr("d", line)
    .style("stroke-width", strokeWidth)
    ;





function ourDlbClick() {
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.scale(1));
  //.translate(margin.left + margin.right,0)); // already done in the zoomed() now

  // TODO BUG there is still a bug where after reset, the next (scroll wheel at least)
  // attempt to zoom snaps right back to the last transform/zoom and thus doesn't make
  // any UI sense ...
  // Probably just add some capture and assign?


}


var currentTransform;
function zoomed() {
  //console.log(d3.event.translate);  // v3
  //console.log(d3.event.scale);      // v3
  //console.log(d3.event.transform);    // v5
  currentTransform = d3.event.transform;

  // Because we translate the chart above, we should do:
  currentTransform = currentTransform.translate(margin.left + margin.right,0);

  svg.attr("transform", currentTransform);
  d3.axisBottom().scale(currentTransform.rescaleX(xScale));
  d3.axisLeft().scale(currentTransform.rescaleY(yScale));

  svg.selectAll("path.line")
    .style("stroke-width", strokeWidth / currentTransform.k)
    ;

}











// From previous explicit call to update data with provided data set
// versus using requestAnimationFrame...
async function update(newdata) {

  // DEBUG ALERT - aborting this function for now
  return;

  svg.selectAll("path.line").remove();
  svg.append("path")
      .datum(newdata) // 10. Binds data to the line
      .attr("class", "line") // Assign a class for styling
      .attr("d", line)
      ;
} // update





var reqId;

function renderChart() {

  try {

    reqId = requestAnimationFrame(renderChart);

    var thisStrokeWidth = strokeWidth;
    if ( currentTransform ) {
      thisStrokeWidth = strokeWidth / currentTransform.k;
    }

    // Get the latest data snapshot
    svg.selectAll("path.line").remove();
    svg.append("path")
      .datum(chartBuf)
      .attr("class", "line")
      .attr("d", line)
      .style("stroke-width", thisStrokeWidth)
      ;
  } catch ( e ) {
    console.log("Error in renderChart: " + e);
  }

}

function cancelRenderChart() {
  cancelAnimationFrame(reqId);
}




module.exports = {
  update: update,
  renderChart: renderChart,
  cancelRenderChart: cancelRenderChart,
};
