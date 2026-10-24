# Runs the X-Tasks web server as a system service, keeping its database and backups in /var/lib/x-tasks-server.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.x-tasks-server;
in
{
  options.services.x-tasks-server = {
    enable = lib.mkEnableOption "the X-Tasks web server";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.server;
      description = "The X-Tasks server package to run.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "The address to listen on; anything but this machine needs tokenFile set.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3918;
      description = "The port to listen on.";
    };

    tokenFile = lib.mkOption {
      # A string, so the secret is never copied into the world-readable Nix store.
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "The path of a file holding the access token browsers sign in with, such as a sops secret.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the port in the firewall.";
    };
  };

  config = lib.mkIf cfg.enable {
    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    systemd.services.x-tasks-server = {
      description = "X-Tasks web server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        X_TASKS_DB = "/var/lib/x-tasks-server/tasks.db";
        X_TASKS_HOST = cfg.host;
        X_TASKS_PORT = toString cfg.port;
      } // lib.optionalAttrs (cfg.tokenFile != null) {
        X_TASKS_TOKEN_FILE = "%d/token";
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        StateDirectory = "x-tasks-server";
        LoadCredential = lib.optional (cfg.tokenFile != null) "token:${cfg.tokenFile}";
        Restart = "on-failure";

        NoNewPrivileges = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        RestrictNamespaces = true;
        LockPersonality = true;
        SystemCallArchitectures = "native";
      };
    };
  };
}
