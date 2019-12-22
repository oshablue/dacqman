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
  // left, top ... right, bottom
  .translateExtent([[0,0],[chartWidth, chartHeight]]) // Unfortunately, this is dependent on window sizing, so would need to grab real-world size data
  .extent([[0,0],[chartWidth, chartHeight]]) // operates totally differently
  ;



// The number of datapoints
var n = 4095; //4096 //5000; //2500; //5000;

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


function zoomed() {
  //console.log(d3.event.translate);  // v3
  //console.log(d3.event.scale);      // v3
  console.log(d3.event.transform);    // v5
  var currentTransform = d3.event.transform;

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
  //svg.selectAll(".dot").remove();
  svg.selectAll("path.line").remove();
  svg.append("path")
      .datum(newdata) // 10. Binds data to the line
      .attr("class", "line") // Assign a class for styling
      .attr("d", line); // 11. Calls the line generator
  /*
  svg.selectAll(".dot")
      .data(newdata)
      .enter().append("circle") // Uses the enter().append() method
      .attr("class", "dot") // Assign a class for styling
      .attr("cx", function(d, i) { return xScale(i) })
      .attr("cy", function(d) { return yScale(d) }) //.y) })
      .attr("r", 0.02);
  */ // Maybe we don't need all that - just the path for fasterness?
} // update

// Continuous loop to update and pull data
var reqId;
//var chartBuf = Buffer.alloc(4096, 0);
function renderChart() {

  try {

    reqId = requestAnimationFrame(renderChart);

    // Get the latest data snapshot
    svg.selectAll("path.line").remove();
    svg.append("path")
      .datum(chartBuf)
      .attr("class", "line")
      .attr("d", line);
  } catch ( e ) {
    console.log("Error in renderChart: " + e);
  }
  //console.log('c');

}

function cancelRenderChart() {
  cancelAnimationFrame(reqId);
}




module.exports = {
  update: update,
  renderChart: renderChart,
  cancelRenderChart: cancelRenderChart,
};

/*
var data = [0,1,2,3,4,5];

// Set the dimensions of the canvas / graph
var margin = {top: 30, right: 20, bottom: 30, left: 50},
    width = 600 - margin.left - margin.right,
    height = 270 - margin.top - margin.bottom;

// Parse the date / time
var parseDate = d3.time.format("%d-%b-%y").parse;

// Set the ranges
var x = d3.time.scale().range([0, width]);
var y = d3.scale.linear().range([height, 0]);

// Define the axes
var xAxis = d3.svg.axis().scale(x)
    .orient("bottom").ticks(5);

var yAxis = d3.svg.axis().scale(y)
    .orient("left").ticks(5);

// Define the line
var valueline = d3.svg.line()
    .x(function(d,i) { return i; })
    .y(function(d,i) { return d; });

// Adds the svg canvas
var svg = d3.select('#chart') //"body")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform",
              "translate(" + margin.left + "," + margin.top + ")")
    .append("path")
        .attr("class", "line")
        .attr("d", valueline(data));

// Add the X axis
svg.append("g")
  .attr("class", "x axis")
  .attr("transform", "translate(0," + height + ")")
  .call(xAxis);

// Add the Y Axis
svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);

// Scale the range of the data
x.domain(d3.extent(data, function(d,i) { return i; }));
y.domain([0, d3.max(data, function(d,i) { return d; })]);
*/

/*
// Get the data
d3.csv("data.csv", function(error, data) {
    data.forEach(function(d) {
        d.date = parseDate(d.date);
        d.close = +d.close;
    });

    // Scale the range of the data
    x.domain(d3.extent(data, function(d) { return d.date; }));
    y.domain([0, d3.max(data, function(d) { return d.close; })]);

    // Add the valueline path.
    svg.append("path")
        .attr("class", "line")
        .attr("d", valueline(data));

    // Add the X Axis
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    // Add the Y Axis
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

});*/
