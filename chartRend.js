/*

  TODO
  - Can we do this with a node module - is there like node-d3?

*/

// Thanks https://vegibit.com/create-a-bar-chart-with-d3-javascript/
// for the demo - just a place holder here
  var chartdata = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
      135, 150, 165, 180, 200, 220, 240, 270, 300, 330, 370, 410];

  var margin = {top: 30, right: 10, bottom: 30, left: 50}

  var oaHeight = 300;
  var oaWidth = 600;
  var height = oaHeight - margin.top - margin.bottom,
      width = oaWidth - margin.left - margin.right,
      barWidth = 40,
      barOffset = 20;

  var dynamicColor;

  var yScale = d3.scale.linear()
      .domain([0, d3.max(chartdata)])
      .range([0, height])

  var xScale = d3.scale.ordinal()
      .domain(d3.range(0, chartdata.length))
      .rangeBands([0, width])

  var colors = d3.scale.linear()
      .domain([0, chartdata.length * .33, chartdata.length * .66, chartdata.length])
      .range(['#d6e9c6', '#bce8f1', '#faebcc', '#ebccd1'])

  var awesome = d3.select('#chart').append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background', '#bce8f1')
      .append('g')
      .attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')')
      .selectAll('rect').data(chartdata)
      .enter().append('rect')
      .style({
          'fill': function (data, i) {
              return colors(i);
          }, 'stroke': '#31708f', 'stroke-width': '5'
      })
      .attr('width', xScale.rangeBand())
      .attr('x', function (data, i) {
          return xScale(i);
      })
      .attr('height', 0)
      .attr('y', height)
      .on('mouseover', function (data) {
          dynamicColor = this.style.fill;
          d3.select(this)
              .style('fill', '#3c763d')
      })

      .on('mouseout', function (data) {
          d3.select(this)
              .style('fill', dynamicColor)
      })

  awesome.transition()
      .attr('height', function (data) {
          return yScale(data);
      })
      .attr('y', function (data) {
          return height - yScale(data);
      })
      .delay(function (data, i) {
          return i * 20;
      })
      .duration(2000)
      .ease('elastic')

  var verticalGuideScale = d3.scale.linear()
      .domain([0, d3.max(chartdata)])
      .range([height, 0])

  var vAxis = d3.svg.axis()
      .scale(verticalGuideScale)
      .orient('left')
      .ticks(10)

  var verticalGuide = d3.select('svg').append('g')
  vAxis(verticalGuide)
  verticalGuide.attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')')
  verticalGuide.selectAll('path')
      .style({fill: 'none', stroke: "#3c763d"})
  verticalGuide.selectAll('line')
      .style({stroke: "#3c763d"})

  var hAxis = d3.svg.axis()
      .scale(xScale)
      .orient('bottom')
      .ticks(chartdata.size)

  var horizontalGuide = d3.select('svg').append('g')
  hAxis(horizontalGuide)
  horizontalGuide.attr('transform', 'translate(' + margin.left + ', ' + (height + margin.top) + ')')
  horizontalGuide.selectAll('path')
      .style({fill: 'none', stroke: "#3c763d"})
  horizontalGuide.selectAll('line')
      .style({stroke: "#3c763d"});
