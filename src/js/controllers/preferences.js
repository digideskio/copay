'use strict';

angular.module('copayApp.controllers').controller('preferencesController',
  function($scope, $rootScope, $timeout, $log, configService, profileService, fingerprintService, walletService) {

    var self = this;
    var fc;
    var config = configService.getSync();

    var disableFocusListener = $rootScope.$on('Local/NewFocusedWalletReady', function() {
     self.init();
    });

    $scope.$on('$destroy', function() {
      disableFocusListener();
    });

    this.init = function() {
      fc = profileService.focusedClient;
      if (fc) {
        $scope.encryptEnabled = walletService.isEncrypted(fc);
        this.externalSource = fc.getPrivKeyExternalSourceName() == 'ledger' ? "Ledger" : null;
        // TODO externalAccount
        //this.externalIndex = fc.getExternalIndex();
      }

      this.touchidAvailable = fingerprintService.isAvailable();
      $scope.touchidEnabled = config.touchIdFor ? config.touchIdFor[fc.credentials.walletId] : null;

      $scope.deleted = false;
      if (fc.credentials && !fc.credentials.mnemonicEncrypted && !fc.credentials.mnemonic) {
        $scope.deleted = true;
      }
    };

    var handleEncryptedWallet = function(cb) {
      $rootScope.$emit('Local/NeedsPassword', false, function(err, password) {
        if (err) return cb(err);
        return cb(walletService.unlock(fc, password));
      });
    };

    $scope.encryptChange = function() {
      var self = this;
      if (!fc) return;
      var val = $scope.encryptEnabled;

      var setPrivateKeyEncryption = function(password, cb) {
        $log.debug('Encrypting private key for', fc.credentials.walletName);

        fc.setPrivateKeyEncryption(password);
        fc.lock();
        profileService.updateCredentials(fc.export(), function() {
          $log.debug('Wallet encrypted');
          return cb();
        });
      };

      var disablePrivateKeyEncryption = function(cb) {
        $log.debug('Disabling private key encryption for', fc.credentials.walletName);

        try {
          fc.disablePrivateKeyEncryption();
        } catch (e) {
          return cb(e);
        }
        profileService.updateCredentials(fc.export(), function() {
          $log.debug('Wallet encryption disabled');
          return cb();
        });
      };

      if (val && !walletService.isEncrypted(fc)) {
        $rootScope.$emit('Local/NeedsPassword', true, function(err, password) {
          if (err || !password) {
            $scope.encryptEnabled = false;
            return;
          }
          setPrivateKeyEncryption(password, function() {
            $rootScope.$emit('Local/NewEncryptionSetting');
            $scope.encryptEnabled = true;
          });
        });
      } else {
        if (!val && walletService.isEncrypted(fc)) {
          handleEncryptedWallet(function(err) {
            if (err) {
              $scope.encryptEnabled = true;
              return;
            }
            disablePrivateKeyEncryption(function(err) {
              $rootScope.$emit('Local/NewEncryptionSetting');
              if (err) {
                $scope.encryptEnabled = true;
                $log.error(err);
                return;
              }
              $scope.encryptEnabled = false;
            });
          });
        }
      }
    };

    $scope.touchidChange = function() {
      var walletId = fc.credentials.walletId;

      var opts = {
        touchIdFor: {}
      };
      opts.touchIdFor[walletId] = $scope.touchidEnabled;

      fingerprintService.check(fc, function(err) {
        if (err) {
          $log.debug(err);
          $timeout(function() {
            $scope.touchidError = true;
            $scope.touchidEnabled = false;
          }, 100);
          return;
        }
        configService.set(opts, function(err) {
          if (err) {
            $log.debug(err);
            $scope.touchidError = true;
            $scope.touchidEnabled = false;
          }
        });
      });
    };
  });
