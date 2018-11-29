(function () {
    'use strict';

    /* global angular: false, requirejs: false */

    requirejs(['highcharts'], function (highchartsFramework) {
        angular.module('highcharts-ng', [])
            .constant('highchartsFramework', highchartsFramework)
            .component('kyHighchart', {
                bindings: {
                    config: '<',
                    changeDetection: '<',
                    disableChangeDetection: '<'
                },
                controller: HighChartNGController
            });
    });

    HighChartNGController.$inject = ['$element', '$timeout', 'highchartsFramework'];

    function HighChartNGController($element, $timeout, Highcharts) {
        var initialized = false,
            seriesId = 0,
            yAxisId = 0,
            xAxisId = 0,
            ctrl = this,
            prevConfig = {},
            mergedConfig = {},
            detector = ctrl.changeDetection || angular.equals;

        this.$onInit = function () {
            initChart();
            initialized = true;
        };

        this.$onChanges = function(changesObject) {
            if (changesObject.config && angular.isDefined(changesObject.config.currentValue)) {
                if (!initialized) {
                    return;
                }
                initChart();
            }
        };

        this.$doCheck = function () {
            if (ctrl.disableChangeDetection === true) {
                return;
            }
            if (!detector(ctrl.config, prevConfig)) {
                prevConfig = angular.merge({}, ctrl.config);
                mergedConfig = getMergedOptions($element, ctrl.config, seriesId);

                //Remove any unlinked objects before adding
                removeUnlinkedObjects(mergedConfig);

                //Allows dynamic adding Axes
                addAnyNewAxes(mergedConfig.yAxis, ctrl.chart, false);
                addAnyNewAxes(mergedConfig.xAxis, ctrl.chart, true);

                //Allows dynamic adding of series
                if (mergedConfig.series) {
                    // Add any new series
                    angular.forEach(ctrl.config.series, function (seriesItem) {
                        if (!ctrl.chart.get(seriesItem.id)) {
                            ctrl.chart.addSeries(seriesItem);
                        }
                    });
                }

                ctrl.chart.update(mergedConfig, true);
            }
        };

        this.$onDestroy = function () {
            if (ctrl.chart) {
                try {
                    ctrl.chart.destroy();
                } catch (ex) {
                    // fail silently as highcharts will throw exception if element doesn't exist
                }

                $timeout(function () { $element.remove(); });
            }
        };

        function initChart() {
            prevConfig = angular.merge({}, ctrl.config);
            mergedConfig = getMergedOptions($element, ctrl.config, seriesId);
            var chartType = getChartType(mergedConfig);
            ctrl.chart = new Highcharts[chartType](mergedConfig);
            ctrl.config.getChartObj = function () {
                return ctrl.chart;
            };

            // Fix resizing bug
            // https://github.com/pablojim/highcharts-ng/issues/550
            var originalWidth = $element[0].clientWidth,
                originalHeight = $element[0].clientHeight;
            $timeout(function () {
                if ($element[0].clientWidth !== 0 &&
                    $element[0].clientHeight !== 0 &&
                    ($element[0].clientWidth !== originalWidth || $element[0].clientHeight !== originalHeight)
                ) {
                    ctrl.chart.reflow();
                }
            }, 0, false);
        }

        function removeItems(newItems, chartItems, id, toIgnore) {
            if (newItems && Array.isArray(newItems)) {
                var ids = ensureIds(newItems, id);
                for (var i = chartItems.length - 1; i >= 0; i -= 1) {
                    var a = chartItems[i];
                    if ((toIgnore.indexOf(a.options.id) < 0) && (ids.indexOf(a.options.id) < 0)) {
                        //if we don't set redraw to true, it can create
                        //glitches in the chart's rendering where the series
                        //doesn't completely re-render
                        a.remove(true);
                    }
                }
            }
        }

        /**
         * Removes unlinked objects, items that have been removed in the config,
         * but not yet removed from the HighChart object.
         * First check to see if there are any axes that need to be removed.
         * If a series is linked to the axis, it will be removed by HighCharts.
         */
        function removeUnlinkedObjects(mergedConfig) {
            removeItems(mergedConfig.yAxis, ctrl.chart.yAxis, yAxisId, 'navigator-y-axis');
            removeItems(mergedConfig.xAxis, ctrl.chart.xAxis, xAxisId, 'navigator-x-axis');
            removeItems(mergedConfig.series, ctrl.chart.series, seriesId, 'highcharts-navigator-series');

            // TODO: do we need to handle removing series from the config that highcharts has removed as part
            // of removing axes?
        }

        function addAnyNewAxes(configAxes, chart, isX) {
            if (configAxes && Array.isArray(configAxes)) {
                angular.forEach(configAxes, function (s) {
                    if (!chart.get(s.id)) {
                        chart.addAxis(s, isX);
                    }
                });
            }
        }
    }

    function getMergedOptions(element, config, seriesId) {
        var mergedOptions = {};

        var defaultOptions = {
            chart: {
                events: {}
            },
            title: {},
            subtitle: {},
            series: [],
            credits: {},
            plotOptions: {},
            navigator: {},
        };

        if (config) {
            //check all series and axis ids are set
            if (config.series) {
                ensureIds(config.series, seriesId);
            }

            mergedOptions = angular.merge(defaultOptions, config);
        } else {
            mergedOptions = defaultOptions;
        }
        mergedOptions.chart.renderTo = element[0];

        //check chart type is set
        return mergedOptions;
    }

    var chartTypeMap = {
        'map': 'Map',
        'chart': 'Chart'
    };

    function getChartType(config) {
        if (angular.isUndefined(config) || angular.isUndefined(config.chartType)) {
            return 'Chart';
        }
        return chartTypeMap[('' + config.chartType).toLowerCase()];
    }

    function ensureIds(chartCollection, collectionId) {
        /*
         Ensures each item in the iterable chartCollection has an id,
         and if not auto-generates one incrementing collectionId
         */
        var ids = [];
        angular.forEach(chartCollection, function (s) {
            if (angular.isUndefined(s.id)) {
                collectionId += 1;
                s.id = 'cc-' + collectionId;
            }
            ids.push(s.id);
        });

        return ids;
    }
}());
