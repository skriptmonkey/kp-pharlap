var app = angular.module("pharlap", ['lens.bridge', 'lens.ui']);

var Util = Util || {};
Util.helpers = {
  formatHuman: function(v,a,b,c,d) {
    return (a=a?[1e3,'k','B']:[1024,'K','iB'],b=Math,c=b.log,d=c(v)/c(a[0])|0,v/b.pow(a[0],d)).toFixed(2) +' '+(d?(a[1]+'MGTPEZY')[--d]+a[2]:'Bytes');
  },
}

app.controller('PharlapCtrl', function($scope, $modal) {
  $scope.util = Util.helpers;

  $scope.state = {
    applying: false
  };

  $scope.curtain = {
    progress: 0,
    message: 'Reading repository information ...'
  };

  $scope.types = ['input', 'graphics', 'network', 'sound', 'other'];

  $scope.data = {
    devices: {},
    modules: {},
    loaded_modules: {},
    modaliases: {},
  };

  $scope.settings = {
    show_akmods: true,
    show_kmods: false,
    blacklist_other: true
  };

  $scope.system = {};

  $scope.openModuleSettingsModal = function(name, settings) {

    var modalInstance = $modal.open({
      backdrop: 'static',
      controller: PharlapModuleSettingsModalCtrl,
      size: 'lg',
      templateUrl: 'moduleSettingsModal.html',
      windowClass: 'no-animation',
      resolve: {
        data: function() {
          return {
            name: name,
            settings: angular.copy(settings)
          };
        }
      }
    });

    modalInstance.result.then(function(data) {
      if( data.hasOwnProperty('name') &&
          data.hasOwnProperty('settings') ) {
        $scope.data.modules[data.name] = data.settings;

        /* update module information */
        $scope.processDevices();
      }
    });
  };

  $scope.openModuleSettings = function(name) {
    var settings = {};
    if( $scope.data.modules.hasOwnProperty(name) ) {
      settings = $scope.data.modules[name];
    }

    $scope.openModuleSettingsModal(name, settings);
  };

  $scope.applyChanges = function() {
    /* return early if we're already applying */
    if ($scope.state.applying) { return; }

    var drivers_install = [];
    var drivers_uninstall = [];

    // process user changes
    for(var path in $scope.data.devices) {
      for(var driver in $scope.data.devices[path].drivers) {
        var n = $scope.data.devices[path].drivers[driver];
        var o = $scope.data._devices[path].drivers[driver];

        if (n.selected !== o.selected) {
          if (n.selected) {
            drivers_install.push(driver);
          }
          else if (o.selected) {
            drivers_uninstall.push(driver)
          }
        }
      }
    }

    var modalInstance = $modal.open({
      backdrop: 'static',
      controller: 'PharlapProgressModalCtrl',
      size: 'lg',
      templateUrl: 'dnfProgressModal.html',
      windowClass: 'no-animation',
      resolve: {
        data: function() {
          return { message: 'Preparing ...', progress: 0 };
        }
      }
    });

    modalInstance.result.then(function(result) {
      if (result == 0) {
        $scope.data._devices = angular.copy($scope.data.devices);
      }

      $scope.state.applying = false;
    });

    $scope.state.applying = true;

    $scope.emit('apply-changes', drivers_install, drivers_uninstall);
  };

  $scope.canApplyChanges = function() {
    return $scope.hasChanges && !$scope.state.applying;
  };

  $scope.canEditModuleSettings = function() {
    return false;
  };

  $scope.countDeviceByClass = function(filter) {
    var result = 0;

    angular.forEach($scope.data.devices, function(v, k) {
      if( v.hasOwnProperty('class') && v['class'] === filter ) {
        result++
      }
    });

    return result > 0 ? result : '';
  };

  $scope.filterDeviceByClass = function(filter) {
    var result = {};

    angular.forEach($scope.data.devices, function(v, k) {
      if( v.hasOwnProperty('class') && v['class'] === filter ) {
        result[k] = v;
      }
    });

    return result;
  };

  $scope.filterDrivers = function(drivers) {
    var result = {};
    var _kernel = '-' + $scope.system.current_kernel;

    angular.forEach(drivers, function(v, k) {
      /* process akmods */
      if( k.indexOf('akmod') === 0 ) {
        if( $scope.settings.show_akmods ) {
          result[k] = v;
        }
      }
      /* process kmods */
      else if( (k.indexOf('kmod') === 0) ) {
        if( $scope.settings.show_kmods && k.indexOf(_kernel) > 0 ) {
          result[k] = v;
        }
      }
      /* process everything else */
      else {
        result[k] = v;
      }
    });

    return result;
  };

  $scope.driverHasModules = function(dv) {
    return dv.hasOwnProperty('modules') && Object.keys(dv.modules).length > 0;
  };

  $scope.getIconName = function(e) {
    return 'logo-' + e.toLowerCase().replace(/ /, '-') + '.png';
  };

  $scope.getQuirks = function(name) {
    modules = $scope.data.modules;
    return modules.hasOwnProperty(name) ? modules[name].options : '';
  };

  $scope.hasQuirks = function(name) {
    modules = $scope.data.modules;
    return modules.hasOwnProperty(name) && modules[name].options.length > 0;
  };

  $scope.isBlacklisted = function(name) {
    modules = $scope.data.modules;
    return modules.hasOwnProperty(name) && modules[name].blacklisted;
  };

  $scope.isLoaded = function(pv, m) {
    return pv.hasOwnProperty('loaded') && pv.loaded.indexOf(m) !== -1;
  };

  $scope.isRecommended = function(driver) {
    return driver.hasOwnProperty('free') && driver.free &&
           driver.hasOwnProperty('from_distro') && driver.from_distro;
  };

  $scope.isSelected = function(driver) {
    return driver.hasOwnProperty('selected') && driver.selected;
  };

  $scope.processDevices = function() {
    angular.forEach($scope.data.devices, function(v, k) {

      /* decorate with loaded */
      if( $scope.data.loaded_modules.hasOwnProperty(v.modalias) ) {
        v.loaded = $scope.data.loaded_modules[v.modalias].module;
      }

      /* decorate with module information */
      if( v.hasOwnProperty('drivers') && v.hasOwnProperty('loaded') ) {
        angular.forEach(v.drivers, function(dv, dk) {
          /* driver is selected if it contains the module that's loaded */
          if( dv.hasOwnProperty('modules') && v.loaded.length > 0 ) {
            for( var _i=0, _l=v.loaded.length; _i<_l; _i++ ) {
              if( dv.modules.indexOf(v.loaded[_i]) !== -1 ) {
                dv.selected = true;
                break;
              }
            }
          }
        });
      }
    });
  };

  $scope.selectDriver = function(device, driver) {
    for(var d in device.drivers) {
      if( d === driver) {
        device.drivers[d].selected = true;
      }
      else {
        delete device.drivers[d].selected;
      }
    }
  };
  $scope.hasChanges = function() {
    _m = angular.equals($scope.data._modules, $scope.data.modules);
    _d = angular.equals($scope.data._devices, $scope.data.devices);

    return  _m && _d;
  };

  $scope.revertChanges = function() {
    /* restore original configuration */
    $scope.data.modules = angular.copy($scope.data._modules);
    $scope.data.devices = angular.copy($scope.data._devices);
  };

  /* SIGNALS */

  // register to configuration updates
  $scope.$on('update-md-progress', function(e, name, progress) {
    $scope.curtain.progress = progress;
    $scope.curtain.message = 'Reading repo information ...'
    $scope.curtain.submessage = name;
  });

  $scope.$on('update-progress', function(e, progress, message) {
    $scope.curtain.progress = progress;
    $scope.curtain.message = 'Searching for packages that match your hardware ...';
    $scope.curtain.submessage = '';
  });

  // register for appLoaded state
  $scope.$on('init-complete', function(e) {
    $('.page-container').removeClass('hide');
    $('.curtain').fadeOut('slow');
  });


  $scope.$on('init-config', function(e, system, ma, lm, d, m) {
    $scope.system = system;
    $scope.data.loaded_modules = lm;
    $scope.data.devices = d;
    $scope.data.modules = m;

    $scope.processDevices();

    $scope.data._modules = angular.copy($scope.data.modules);
    $scope.data._devices = angular.copy($scope.data.devices);
  });

  // INIT
  $scope.emit("init");
});

app.controller('PharlapModuleSettingsModalCtrl', function($scope, $modalInstance, data) {
  $scope.data = data;

  $scope.ok = function() {
    $modalInstance.close($scope.data);
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };
});

app.controller('PharlapProgressModalCtrl', function($scope, $modalInstance, data) {
  $scope.message = data.message;
  $scope.progress = data.progress;
  $scope.downloads_total = 0;
  $scope.downloads_current = 0;
  $scope.updates_current = 0;

  $scope.ok = function() {
    $modalInstance.close($scope.data);
  };

  // register for appLoaded state
  $scope.$on('dnf-transaction-state', function(e, state, data) {
    $scope.state = state;
    switch (state) {
      case 'start-run':
        $scope.message = 'Calculating ...';
        break;

      case 'pgk-to-download':
        console.log(angular.fromJson(data));
        break;

      case 'download':
        $scope.message = 'Downloading packages ...';
        $scope.progress = 10;
        break;

      case 'run-transaction':
        $scope.message = 'Updating packages ...';
        $scope.progress = 50;
        break;

      case 'verify':
        $scope.progress = 90;
        break;

      case 'end-run':
        $scope.message = 'Finished.';
        $scope.progress = 100;
        $modalInstance.close(0);
        break;

      default:
    }
  });

  $scope.$on('dnf-download-start', function(e, num_files, num_bytes) {
    $scope.downloads_total = num_files;
  });

  $scope.$on('dnf-download-progress', function(e, package, frac, total_frac, total_files) {
    var _progress = 10 + Math.floor(40 * total_frac);

    if ($scope.progress !== _progress) {
      var _remaining = $scope.downloads_total - total_files;
      var _package = package.split(',')[0];
      $scope.progress = _progress;
      $scope.message = 'Downloading ' + _package + ', ' + _remaining + ' file' + (_remaining == 1 ? '' : 's') + ' remaining ...';
    }
  });

  $scope.$on('dnf-rpm-progress', function(e, package, action, te_current, te_total, ts_current, ts_total) {
    var _package = package.split(',')[0];

    switch (action) {
      case 'install':
        $scope.progress = 50 + Math.floor(40 * (ts_current + te_current / te_total) / ts_total);
        $scope.message = 'Installing ' + _package + ' ...';
        break;

      case 'erase':
        $scope.progress = 50 + Math.floor(40 * (ts_current + te_current / te_total) / ts_total);
        $scope.message = 'Removing ' + _package + ' ...';
        break;

      case 'verify':
        $scope.progress = 90 + Math.floor(10 * ts_current / ts_total);
        $scope.message = 'Verifying ' + _package + ' ...';
        break;
    }
  });

  $scope.$on('dnf-download-start', function(e, error) {
    console.log('ERROR', error);
  });

  $scope.$on('dnf-abort', function(e, error) {
    $scope.message = 'Aborting ...';
    $modalInstance.close(1);
  });
});

/*
** PAGE HANDLER
*/
$(document).ready( function() {
  /* configure korobar */
  var fixed   = true;
  var korobar = $('#korobar');
  var page    = $('.page-container');
  var footer  = $('footer');
  var start   = 0;

  /* helper function to frob element heights for the layered effect */
  var resizeHelper = function() {
    // banner correction
    if( $('#banner').length ) {
      start = $('#banner').outerHeight();
    }

    /* calculate korobar position and initial pinning state */
    if( start - $(window).scrollTop() <= 0 ) {
      korobar.css({ position: 'fixed', top: 0 });
      fixed = true;
    }
    else {
      korobar.css({ position: 'absolute', top: start + 'px' });
      fixed = false;
    }

    /* frob page-container minimum height to at least the footer top */
    page.css({
      'min-height': ($(window).height()-footer.outerHeight()) + 'px',
      'margin-bottom': footer.outerHeight() + 'px'
    });

    /* frob page-content minimum height to consume immediate window */
    $('.page-content').css('min-height', ( $(window).height() - 96 )  + 'px');
  }

  /* pin korobar to top when it passes */
  $(window).on('scroll', function() {
    if( !fixed && (korobar.offset().top - $(window).scrollTop() <= 0) ) {
      korobar.css({ position: 'fixed', top: 0, });
      fixed = true;
    }
    else if( fixed && $(window).scrollTop() <= start ) {
      korobar.css({ position: 'absolute', top: start + 'px' });
      fixed = false;
    }
  });

  /* bind to resize events */
  $(window).on('resize', resizeHelper);

  /* turn on tabs */
  $("[data-toggle='tab']").on('click', function(e) {
    e.preventDefault();
    $(this).tab('show');
  });

  /* smooth scroll targets */
  $('a[href*=#]:not([href=#]):not([data-toggle])').click(function() {
    if( location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') || location.hostname == this.hostname ) {
      var target = $(this.hash);
      target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
      if( target.length ) {
        $('html,body').animate({ scrollTop: target.offset().top - korobar.height() - 16 }, 1000);
        return false;
      }
    }
  });

  /* initial call to page resize helper */
  setTimeout(function() { resizeHelper(); $('.loader').fadeIn('slow')}, 0);

  /* TODO: fake slow load */
  //setTimeout(function() { angular.element(document).scope().$broadcast('appLoaded'); }, 3000);
});
