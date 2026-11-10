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
      description = "The address to listen on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3918;
      description = "The port to listen on.";
    };

    passwordHashFile = lib.mkOption {
      # A string, so the file is never copied into the world-readable Nix store.
      type = lib.types.str;
      description = "The accounts file: one `name:hash` line per admin, from `npm run hash-password`, such as a sops secret. Admins add other users on the Users page.";
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
        X_TASKS_PASSWORD_HASH_FILE = "%d/password-hash";
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        StateDirectory = "x-tasks-server";
        LoadCredential = [ "password-hash:${cfg.passwordHashFile}" ];
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
