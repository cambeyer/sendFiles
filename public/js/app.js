/*
 * jQuery File Upload Plugin Angular JS Example
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2013, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

/* jshint nomen:false */
/* global window, angular */

;(function () {
    'use strict';

    var url = '/upload/';

    angular.module('demo', [
        'blueimp.fileupload'
    ])
        .config([
            '$httpProvider', 'fileUploadProvider',
            function ($httpProvider, fileUploadProvider) {
                delete $httpProvider.defaults.headers.common['X-Requested-With'];
                fileUploadProvider.defaults.redirect = window.location.href.replace(
                    /\/[^\/]*$/,
                    '/cors/result.html?%s'
                );
            }
        ])
        
        .run(['$rootScope', '$interval',
            function ($rootScope, $interval) {
                /*global io*/
                $rootScope.socket = io();

            }
        ])

        .controller('DemoFileUploadController', [
            '$scope', '$http', '$filter', '$window', '$rootScope',
            function ($scope, $rootScope) {
                $scope.options = {
                    url: url
                };
                $scope.loadingFiles = false;
                $scope.queue = $rootScope.queue;
            }
        ]);

}());
