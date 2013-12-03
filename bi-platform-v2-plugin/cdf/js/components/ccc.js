
pen.require(["cdf/lib/CCC/protovis", "cdf/lib/CCC/pvc-d1.0", "cdf/lib/CCC/def", "cdf/components/core"], function(_pv, _pvc, _def) {
    // Publish globally
    pvc = _pvc;
    pv  = _pv;
    def = _def;

    ProtovisComponent = BaseComponent.extend({

        update: function() {
          if (this.parameters == undefined) {
            this.parameters = [];
          }

          // clear previous table
          $("#"+this.htmlObject).empty();

          var myself = this;
          Dashboards.fetchData(this.chartDefinition, this.parameters, function(values) {
            changedData = undefined;
            if((typeof(myself.postFetch)=='function')) {
                changedData = myself.postFetch(values);
            }
            if (changedData != undefined) {
                values = changedData;
            }
            myself.render(values);
          });
        },

        render: function(values) {
          $("#" + this.htmlObject).append('<div id="'+ this.htmlObject  +'protovis"></div>');

          var vis = new pv.Panel()
            .canvas(this.htmlObject + "protovis")
            .width(this.width)
            .height(this.height);

          this.customfunction(vis,values);

          vis.root.render();
        },

        processdata: function(values) {
          this.render(values);
        }
    });

    BaseCccComponent = BaseComponent.extend({

        query: null,
        chart: null,

        _preProcessChartDefinition: function() {
            var chartDef = this.chartDefinition;
            if(chartDef){
                // Obtain effective compatVersion
                var compatVersion = chartDef.compatVersion;
                if(compatVersion == null){
                    compatVersion = typeof pvc.defaultCompatVersion === 'function' ?
                                    pvc.defaultCompatVersion() :
                                    1;
                }

                if(compatVersion <= 1){
                    // Properties that are no more registered in the component
                    // and that had a name mapping.
                    // The default mapping, for unknown properties, doesn't work.
                    if('showLegend' in chartDef){
                        chartDef.legend = chartDef.showLegend;
                        delete chartDef.showLegend;
                    }

                    // Don't presume chartDef props must be own
                    for(var p in chartDef){
                        var m = /^barLine(.*)$/.exec(p);
                        if(m){
                            p2 = 'secondAxis' + (m[1] || '');
                            chartDef[p2] = chartDef[p];
                            delete chartDef[p];
                        }
                    }
                }
            }
        },

        exportChart: function(outputType, overrides) {

            var _exportIframe = null;

            // We need the same parameters passed here
            var myself = this;

            var buildChartDefinition = function(overrides) {

                overrides = overrides || {};
                var chartDefinition = {};

                var _params = Dashboards.objectToPropertiesArray( $.extend({},Dashboards.propertiesArrayToObject(myself.parameters), overrides) )

                for (var param in _params) {
                    if(myself.parameters.hasOwnProperty(param)) {
                        var value;
                        var name = myself.parameters[param][0];
                        value = Dashboards.getParameterValue(myself.parameters[param][1]);
                        if($.isArray(value) && value.length == 1 && ('' + value[0]).indexOf(';') >= 0){
                            //special case where single element will wrongly be treated as a parseable array by cda
                            value = doCsvQuoting(value[0],';');
                        }
                        //else will not be correctly handled for functions that return arrays
                        if (typeof value == 'function') value = value();
                        chartDefinition['param' + name] = value;
                    }
                }

                var scriptName =  myself.name.replace(/render_/,"");
                chartDefinition.script = ("/"+ Dashboards.context.solution + "/" + Dashboards.context.path + "/" + scriptName +".js").replace(/\/+/g,'/') ;
                chartDefinition.attachmentName = scriptName;
                return chartDefinition;
            };

            var chartDefinition = buildChartDefinition(overrides);
            chartDefinition.outputType = outputType;

            _exportIframe = _exportIframe || $('<iframe style="display:none">');
            _exportIframe.detach();
            _exportIframe[0].src = "../cgg/draw?" + $.param(chartDefinition);
            _exportIframe.appendTo($('body'));
        }


    })

    CccComponent = BaseCccComponent.extend({

        query: null,
        chart: null,

        update : function() {
            if (this.parameters == undefined) {
                this.parameters = [];
            }

            // clear previous table
            var ph = $("#"+this.htmlObject).empty();
            var myself = this;

            // Set up defaults for height and width
            if(typeof(this.chartDefinition.width) === "undefined")
                this.chartDefinition.width = ph.width();

            if(typeof(this.chartDefinition.height) === "undefined")
                this.chartDefinition.height = ph.height();

            if (Modernizr != undefined && Modernizr.svg) {
                this.renderChart();
            } else {
                pv.listenForPageLoad(function() {
                    myself.renderChart();
                });
            }
        },

        renderChart: function() {
            var myself = this;
            if(this.chartDefinition.dataAccessId || myself.chartDefinition.query){

                this.query = new Query(this.chartDefinition);

                this.query.fetchData(this.parameters, function(values) {
                    var changedValues = undefined;
                    if((typeof(myself.postFetch)=='function')){
                        changedValues = myself.postFetch(values);
                        $("#" + this.htmlObject).append('<div id="'+ myself.htmlObject  +'protovis"></div>');
                    }
                    if (changedValues != undefined) {
                        values = changedValues;
                    }
                    myself.render(values);
                });

            }
            else if(this.valuesArray != undefined){
                this.render(this.valuesArray);
            }
            else{
                // initialize the component only
                this.render();
            }
        },

        render: function(values) {

            $("#" + this.htmlObject).append('<div id="'+ this.htmlObject  +'protovis"></div>');

            this._preProcessChartDefinition();

            var o = $.extend({},this.chartDefinition);
            o.canvas = this.htmlObject+'protovis';
            // Extension points
            if(typeof o.extensionPoints != "undefined"){
                var ep = {};
                o.extensionPoints.forEach(function(a){
                    ep[a[0]]=a[1];
                });
                o.extensionPoints=ep;
            }

            this.chart =  new this.cccType(o);
            if(arguments.length > 0){
                this.chart.setData(values,{
                    crosstabMode: this.crosstabMode,
                    seriesInRows: this.seriesInRows
                });
            }
            this.chart.render();
        }

    });


    /*
     *   Modified version of CccComponent which loads 2 datasources.
     */
    CccComponent2 = BaseCccComponent.extend({

         query: null,
         sQuery: null,  // second datasource
         chart: null,

         update : function() {

             var dataQuery = null, sDataQuery = null;

             if (this.parameters == undefined) {
                 this.parameters = [];
             };

             // clear previous table
             $("#"+this.htmlObject).empty();
        var myself = this;


             this.query = new Query(this.chartDefinition);

             this.sQuery = new Query({
                 path: this.chartDefinition.path,
                 dataAccessId: this.chartDefinition.structDatasource
             });

             var executed = false;
             var execComponent = function() {

                 if (   ( dataQuery != null)
                     && (sDataQuery != null)
                     && !executed) {

                     myself.render(dataQuery, sDataQuery);
                     executed = true;   // safety in case both queries return
                 // simultaneously (is this possible in single-threaded Javascript?)
                 }

             };

             pv.listenForPageLoad(function() {
                 myself.query.fetchData(myself.parameters, function(values) {
                     // why is changedValues a GLOBAL ??  potential conflicts!!
                     var changedValues = undefined;
                     if((typeof(myself.postFetch)=='function')){
                         changedValues = myself.postFetch(values);
                         $("#" + this.htmlObject).append('<div id="'+ this.htmlObject  +'protovis"></div>');
                     }
                     if (changedValues != undefined) {
                         values = changedValues;
                     }

                     dataQuery = values;
                     execComponent();
                 });
             });

             // load the second query (in parallel)
             pv.listenForPageLoad(function() {
                 myself.sQuery.fetchData(myself.parameters, function(values) {
                     var changedValues = undefined;
                if((typeof(myself.postFetch)=='function')){
                    changedValues = myself.postFetch(values);
                         $("#" + this.htmlObject).append('<div id="'+ this.htmlObject  +'protovis"></div>');
                     }
                     if (changedValues != undefined) {
                         values = changedValues;
                     }

                     sDataQuery = values;
                     execComponent();
                 });
             });
         },

         render: function(values, sValues) {

             $("#" + this.htmlObject).append('<div id="'+ this.htmlObject  +'protovis"></div>');

             this._preProcessChartDefinition();

             var o = $.extend({},this.chartDefinition);
             o.canvas = this.htmlObject+'protovis';
             // Extension points
             if(typeof o.extensionPoints != "undefined"){
                 var ep = {};
                 o.extensionPoints.forEach(function(a){
                     ep[a[0]]=a[1];
                 });
                 o.extensionPoints=ep;
             }
             this.chart =  new this.cccType(o);
             this.chart.setData(values,{
                 crosstabMode: this.crosstabMode,
                 seriesInRows: this.seriesInRows
             });

             this.chart.setStructData(sValues);
             this.chart.render();
         }

     });


    CccAreaChartComponent = CccComponent.extend({

        cccType: pvc.AreaChart

    });

    CccStackedDotChart = CccComponent.extend({

        cccType: pvc.StackedDotChart
    });

    CccDotChartComponent = CccComponent.extend({

        cccType: pvc.DotChart

    });

    CccLineChartComponent = CccComponent.extend({

        cccType: pvc.LineChart

    });

    CccStackedLineChartComponent = CccComponent.extend({

        cccType: pvc.StackedLineChart

    });

    CccStackedAreaChartComponent = CccComponent.extend({

        cccType: pvc.StackedAreaChart

    });

    CccBarChartComponent = CccComponent.extend({

        cccType: pvc.BarChart

    });

    CccPieChartComponent = CccComponent.extend({

        cccType: pvc.PieChart

    });

    CccHeatGridChartComponent = CccComponent.extend({

        cccType: pvc.HeatGridChart

    });

    CccBulletChartComponent = CccComponent.extend({

        cccType: pvc.BulletChart

    });

    CccWaterfallChartComponent = CccComponent.extend({

        cccType: pvc.WaterfallChart

    });


    CccMetricDotChartComponent = CccComponent.extend({

        cccType: pvc.MetricDotChart

    });

    CccMetricLineChartComponent = CccComponent.extend({

        cccType: pvc.MetricLineChart

    });


    CccParCoordComponent = CccComponent.extend({

        cccType: pvc.ParallelCoordinates

    });

    CccDataTreeComponent = CccComponent2.extend({

        cccType: pvc.DataTree

    });

    CccBoxplotChartComponent = CccComponent.extend({

         cccType: pvc.BoxplotChart

     });

    CccTreemapChartComponent = CccComponent.extend({

        cccType: pvc.TreemapChart

    });

    CccNormalizedBarChartComponent = CccComponent.extend({

        cccType: pvc.NormalizedBarChart

    });

});
