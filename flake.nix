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
      in
      {
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
      });
}
