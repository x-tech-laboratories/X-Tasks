{
  description = "X-Tasks — a todo manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        electron = pkgs.electron_43;
        nodejs = pkgs.nodejs_22;

        # What the desktop app and the web server share: the source, its npm packages and the Node they build with.
        npm_package = attributes: pkgs.buildNpmPackage ({
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = self;

          npmDepsHash = "sha256-mWuun0jNBWr/1DHWJ+cKL1COZ611rQC0+AejaHGPPos=";
          inherit nodejs;

          # The npm-downloaded Electron cannot run on NixOS and the download needs the network.
          env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
        } // attributes);
      in
      {
        packages.default = npm_package {
          pname = "x-tasks";

          nativeBuildInputs = with pkgs; [ makeWrapper copyDesktopItems ];

          buildPhase = ''
            runHook preBuild
            npm run build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            npm prune --omit=dev --ignore-scripts
            mkdir -p $out/lib/x-tasks
            cp -r out package.json node_modules $out/lib/x-tasks/
            makeWrapper ${electron}/bin/electron $out/bin/x-tasks \
              --add-flags $out/lib/x-tasks \
              --unset ELECTRON_RUN_AS_NODE
            runHook postInstall
          '';

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "x-tasks";
              desktopName = "X-Tasks";
              comment = "Todo manager";
              exec = "x-tasks %U";
              icon = "checkbox-checked";
              categories = [ "Office" "ProjectManagement" ];
            })
          ];

          meta.mainProgram = "x-tasks";
        };

        # The web app and the server that hosts it, run with plain Node.
        packages.server = npm_package {
          pname = "x-tasks-server";

          nativeBuildInputs = [ pkgs.makeWrapper ];

          buildPhase = ''
            runHook preBuild
            npm run build:server
            runHook postBuild
          '';

          # Node 22 still marks node:sqlite as experimental and would warn on every start.
          installPhase = ''
            runHook preInstall
            npm prune --omit=dev --ignore-scripts
            mkdir -p $out/lib/x-tasks-server/out
            cp -r out/server out/web $out/lib/x-tasks-server/out/
            cp -r package.json node_modules $out/lib/x-tasks-server/
            makeWrapper ${nodejs}/bin/node $out/bin/x-tasks-server \
              --add-flags "--disable-warning=ExperimentalWarning $out/lib/x-tasks-server/out/server/index.js"
            runHook postInstall
          '';

          meta.mainProgram = "x-tasks-server";
        };

        devShells.default = pkgs.mkShell {
          packages = [ nodejs electron ];

          shellHook = ''
            # VSCode's terminal exports this, which makes Electron run as bare node and die on the ESM main.
            unset ELECTRON_RUN_AS_NODE

            # The npm-downloaded Electron cannot run on NixOS, so use the nixpkgs one.
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export ELECTRON_OVERRIDE_DIST_PATH="${electron}/libexec/electron"
            export ELECTRON_EXEC="${electron}/bin/electron"

            # electron-vite dev launches this binary; without it the dev server reports "Electron uninstall".
            export ELECTRON_EXEC_PATH="${electron}/bin/electron"

            echo "x-tasks dev shell · node $(node -v) · electron ${electron.version}"
          '';
        };
      }) // {
      nixosModules.default = import ./nix/server-module.nix self;
    };
}
