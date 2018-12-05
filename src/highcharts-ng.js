/**
 * highcharts-ng
 * @version 0.0.14
 * @link https://github.com/pablojim/highcharts-ng
 * @author Barry Fitzgerald
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */

(function () {
    'use strict';

    /* global angular: false, requirejs: false */

    requirejs(['highcharts'], function (highchartsFramework) {
        angular.module('highcharts-ng', [])
            .constant('highchartsFramework', highchartsFramework)
            .factory('highchartsService', ['$q', 'highchartsFramework', HighchartsService])
            .directive('kyHighchart', ['highchartsService', '$timeout', HighchartDirective]);
    });

    function HighchartsService($q, highchartsFramework) {
        var highchartsProm = $q.when(highchartsFramework);

        return {
            getHighcharts: getHighchartsOnce,
            ready: function ready(callback, thisArg) {
                getHighchartsOnce().then(function () {
                    callback.call(thisArg);
                });
            }
        };

        function getHighchartsOnce() {
            return highchartsProm;
        }
    }

    function HighchartDirective(highchartsNGUtils, $timeout) {
        // acceptable shared state
        var seriesId = 0,
            // immutable
            axisNames = ['xAxis', 'yAxis'],
            chartTypeMap = {
                'stock': 'StockChart',
                'map':   'Map',
                'chart': 'Chart'
            };

        return {
            restrict: 'E',
            replace: false,
            template: '<div></div>',
            scope: {
                config: '=',
                disableDataWatch: '='
            },
            link: postLink
        };

        function postLink(scope, element, attrs) {
            function highchartsCb(Highcharts) {
                linkWithHighcharts(Highcharts, scope, element, attrs);
            }
            highchartsNGUtils
                .getHighcharts()
                .then(highchartsCb);
        }

        function linkWithHighcharts(Highcharts, scope, element, attrs) {
            // We keep some chart-specific variables here as a closure
            // instead of storing them on 'scope'.

            // prevSeriesOptions is maintained by processSeries
            var prevSeriesOptions = {};
            // chart is maintained by initChart
            var chart = false;

            initChart();

            if (scope.disableDataWatch) {
                scope.$watchCollection('config.series', function (newSeries, oldSeries) {
                    if (!angular.equals(newSeries, oldSeries)) {
                        initChart();
                    }
                    processSeries(newSeries, oldSeries);
                    chart.redraw();
                });
            } else {
                scope.$watch('config.series', function (newSeries, oldSeries) {
                    if (newSeries !== oldSeries) {
                        initChart();
                    }
                    var needsRedraw = processSeries(newSeries, oldSeries);
                    if (needsRedraw) {
                        chart.redraw();
                    }
                }, true);
            }

            scope.$watch(getChartType, function (chartType, oldChartType) {
                if (chartType === oldChartType) return;
                initChart();
            });

            angular.forEach(axisNames, function (axisName) {
                scope.$watch('config.' + axisName, function (newAxes) {
                    if (!newAxes) {
                        return;
                    }

                    if (angular.isArray(newAxes)) {

                        for (var axisIndex = 0; axisIndex < newAxes.length; axisIndex++) {
                            var axis = newAxes[axisIndex];

                            if (axisIndex < chart[axisName].length) {
                                chart[axisName][axisIndex].update(axis, false);
                                updateZoom(chart[axisName][axisIndex], angular.copy(axis));
                            }

                        }

                    } else {
                        // update single axis
                        chart[axisName][0].update(newAxes, false);
                        updateZoom(chart[axisName][0], angular.copy(newAxes));
                    }

                    chart.redraw();
                }, true);
            });

            scope.$watch('config.options', function (newOptions, oldOptions, scope) {
                //do nothing when called on registration
                if (newOptions === oldOptions) return;
                initChart();
                processSeries(scope.config.series);
                chart.redraw();
            }, true);

            scope.$watch('config.credits.enabled', function (enabled) {
                if (enabled) {
                    chart.credits.show();
                } else if (chart.credits) {
                    chart.credits.hide();
                }
            });

            scope.$watch('config.size', function (newSize, oldSize) {
                if (newSize === oldSize) return;
                if (newSize) {
                    chart.setSize(newSize.width || chart.chartWidth, newSize.height || chart.chartHeight);
                }
            }, true);

            scope.$on('highchartsng.reflow', function () {
                chart.reflow();
            });

            scope.$watch('config.title', function (newTitle) {
                chart.setTitle(newTitle, true);
            }, true);

            scope.$watch('config.subtitle', function (newSubtitle) {
                chart.setTitle(true, newSubtitle);
            }, true);

            scope.$watch('config.loading', function (loading) {
                if (loading) {
                    chart.showLoading(loading === true ? null : loading);
                } else {
                    chart.hideLoading();
                }
            });

            scope.$watch('config.noData', function (noData) {
                if (scope.config && scope.config.loading) {
                    chart.showLoading(noData);
                }
            }, true);

            scope.$on('$destroy', function () {
                if (chart) {
                    try {
                        chart.destroy();
                    } catch (ex){
                        // fail silently as highcharts will throw exception if element doesn't exist
                    }

                    $timeout(function () { element.remove(); });
                }
            });

            function initChart() {
                if (chart) {
                    chart.destroy();
                }
                prevSeriesOptions = {};
                var config = scope.config || {};
                var mergedOptions = getMergedOptions(scope, element, config);
                var func = config.func || undefined;
                var chartType = getChartType(scope);

                chart = new Highcharts[chartType](mergedOptions, func);

                for (var i = 0; i < axisNames.length; i++) {
                    if (config[axisNames[i]]) {
                        processExtremes(chart, config[axisNames[i]], axisNames[i]);
                    }
                }
                if (config.loading) {
                    chart.showLoading();
                }
                config.getHighcharts = function () {
                    return chart;
                };
            }

            function processSeries(series, seriesOld) {
                var i;
                var ids = [];

                if (series) {
                    var setIds = ensureIds(series);
                    if (setIds && !scope.disableDataWatch) {
                        //If we have set some ids this will trigger another digest cycle.
                        //In this scenario just return early and let the next cycle take care of changes
                        return false;
                    }

                    //Find series to add or update
                    angular.forEach(series, function (seriesItem, idx) {
                        ids.push(seriesItem.id);
                        var chartSeries = chart.get(seriesItem.id);
                        if (chartSeries) {
                            if (!angular.equals(prevSeriesOptions[seriesItem.id], chartOptionsWithoutEasyOptions(seriesItem))) {
                                chartSeries.update(angular.copy(seriesItem), false);
                            } else {
                                if (seriesItem.visible !== undefined && chartSeries.visible !== seriesItem.visible) {
                                    chartSeries.setVisible(seriesItem.visible, false);
                                }

                                // Make sure the current series index can be accessed in seriesOld
                                if (idx < seriesOld.length) {
                                    var sOld = seriesOld[idx];
                                    var sCopy = angular.copy(sOld);

                                    // Get the latest data point from the new series
                                    var ptNew = seriesItem.data[seriesItem.data.length - 1];

                                    // Check if the new and old series are identical with the latest data point added
                                    // If so, call addPoint without shifting
                                    sCopy.data.push(ptNew);
                                    if (angular.equals(sCopy, seriesItem)) {
                                        chartSeries.addPoint(ptNew, false);
                                    }

                                    // Check if the data change was a push and shift operation
                                    // If so, call addPoint WITH shifting
                                    else {
                                        sCopy.data.shift();
                                        if (angular.equals(sCopy, seriesItem)) {
                                            chartSeries.addPoint(ptNew, false, true);
                                        }
                                        else {
                                            chartSeries.setData(angular.copy(seriesItem.data), false);
                                        }
                                    }
                                }
                                else {
                                    chartSeries.setData(angular.copy(seriesItem.data), false);
                                }
                            }
                        } else {
                            chart.addSeries(angular.copy(seriesItem), false);
                        }
                        prevSeriesOptions[seriesItem.id] = chartOptionsWithoutEasyOptions(seriesItem);
                    });

                    //  Shows no data text if all series are empty
                    if (scope.config.noData) {
                        var chartContainsData = false;

                        for (i = 0; i < series.length; i++) {
                            if (series[i].data && series[i].data.length > 0) {
                                chartContainsData = true;

                                break;
                            }
                        }

                        if (!chartContainsData) {
                            chart.showLoading(scope.config.noData);
                        } else {
                            chart.hideLoading();
                        }
                    }
                }

                //Now remove any missing series
                for (i = chart.series.length - 1; i >= 0; i--) {
                    var s = chart.series[i];
                    if (s.options.id !== 'highcharts-navigator-series' && !_.contains(ids, s.options.id)) {
                        s.remove(false);
                    }
                }

                return true;
            }
        }

        function ensureIds(series) {
            var changed = false;
            angular.forEach(series, function (seriesItem) {
                if (angular.isUndefined(seriesItem.id)) {
                    seriesItem.id = 'series-' + seriesId++;
                    changed = true;
                }
            });
            return changed;
        }

        function getMergedOptions(scope, element, config) {
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
                navigator: {enabled: false},
                xAxis: {
                    events: {}
                },
                yAxis: {
                    events: {}
                }
            };

            mergedOptions = config.options ? deepExtend(defaultOptions, config.options) : defaultOptions;
            mergedOptions.chart.renderTo = element[0];

            angular.forEach(axisNames, function (axisName) {
                if (angular.isDefined(config[axisName])) {
                    mergedOptions[axisName] = deepExtend(mergedOptions[axisName] || {}, config[axisName]);

                    if (angular.isDefined(config[axisName].currentMin) ||
                        angular.isDefined(config[axisName].currentMax)) {

                        prependMethod(mergedOptions.chart.events, 'selection', function (e){
                            var thisChart = this;
                            if (e[axisName]) {
                                scope.$apply(function () {
                                    scope.config[axisName].currentMin = e[axisName][0].min;
                                    scope.config[axisName].currentMax = e[axisName][0].max;
                                });
                            } else {
                                //handle reset button - zoom out to all
                                scope.$apply(function () {
                                    scope.config[axisName].currentMin = thisChart[axisName][0].dataMin;
                                    scope.config[axisName].currentMax = thisChart[axisName][0].dataMax;
                                });
                            }
                        });

                        prependMethod(mergedOptions.chart.events, 'addSeries', function (e){
                            scope.config[axisName].currentMin = this[axisName][0].min || scope.config[axisName].currentMin;
                            scope.config[axisName].currentMax = this[axisName][0].max || scope.config[axisName].currentMax;
                        });
                        prependMethod(mergedOptions[axisName].events, 'setExtremes', function (e) {
                            if (e.trigger && e.trigger !== 'zoom') { // zoom trigger is handled by selection event
                                $timeout(function () {
                                    scope.config[axisName].currentMin = e.min;
                                    scope.config[axisName].currentMax = e.max;
                                    scope.config[axisName].min = e.min; // set min and max to adjust scrollbar/navigator
                                    scope.config[axisName].max = e.max;
                                }, 0);
                            }
                        });
                    }
                }
            });

            if (config.title) {
                mergedOptions.title = config.title;
            }
            if (config.subtitle) {
                mergedOptions.subtitle = config.subtitle;
            }
            if (config.credits) {
                mergedOptions.credits = config.credits;
            }
            if (config.size) {
                if (config.size.width) {
                    mergedOptions.chart.width = config.size.width;
                }
                if (config.size.height) {
                    mergedOptions.chart.height = config.size.height;
                }
            }
            return mergedOptions;
        }

        function updateZoom(axis, modelAxis) {
            var extremes = axis.getExtremes();
            if (modelAxis.currentMin !== extremes.dataMin || modelAxis.currentMax !== extremes.dataMax) {
                if (axis.setExtremes) {
                    axis.setExtremes(modelAxis.currentMin, modelAxis.currentMax, false);
                } else {
                    axis.detachedsetExtremes(modelAxis.currentMin, modelAxis.currentMax, false);
                }
            }
        }

        function processExtremes(chart, axis, axisName) {
            if (axis.currentMin || axis.currentMax) {
                chart[axisName][0].setExtremes(axis.currentMin, axis.currentMax, true);
            }
        }

        function chartOptionsWithoutEasyOptions(options) {
            return angular.extend(
                deepExtend({}, options),
                { data: null, visible: null }
            );
        }

        function getChartType(scope) {
            if (scope.config === undefined) return 'Chart';
            return chartTypeMap[('' + scope.config.chartType).toLowerCase()] ||
                (scope.config.useHighStocks ? 'StockChart' : 'Chart');
        }
    }

    function prependMethod(obj, method, func) {
        var original = obj[method];
        obj[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            func.apply(this, args);
            if (original) {
                return original.apply(this, args);
            }
        };
    }

    function deepExtend(destination, source) {
        //Slightly strange behaviour in edge cases (e.g. passing in non objects)
        //But does the job for current use cases.
        if (angular.isArray(source)) {
            destination = angular.isArray(destination) ? destination : [];
            for (var i = 0; i < source.length; i++) {
                destination[i] = deepExtend(destination[i] || {}, source[i]);
            }
        } else if (angular.isObject(source)) {
            destination = angular.isObject(destination) ? destination : {};
            for (var property in source) {
                destination[property] = deepExtend(destination[property] || {}, source[property]);
            }
        } else {
            destination = source;
        }
        return destination;
    }
}());
