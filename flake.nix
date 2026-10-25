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

        # The Android SDK is unfree and needs its license accepted, so only the Android shells use this package set.
        android_pkgs = import nixpkgs {
          inherit system;
          config = { allowUnfree = true; android_sdk.accept_license = true; };
        };
        # The build-tools the Android Gradle plugin asks for by default.
        android_build_tools = "35.0.0";
        android_sdk_options = {
          platformVersions = [ "36" ];
          buildToolsVersions = [ android_build_tools ];
        };
        android_sdk = android_pkgs.androidenv.composeAndroidPackages android_sdk_options;

        # The same SDK plus the emulator and an Android 36 system image, kept apart because the image is large.
        android_emulator_sdk = android_pkgs.androidenv.composeAndroidPackages (android_sdk_options // {
          includeEmulator = true;
          includeSystemImages = true;
          systemImageTypes = [ "google_apis" ];
          abiVersions = [ "x86_64" ];
        });

        # Starts the x-tasks emulator, creating its virtual device on first use, and waits until it has booted.
        android_emulator = pkgs.writeShellApplication {
          name = "x-tasks-emulator";
          runtimeInputs = [ android_emulator_sdk.androidsdk ];
          text = ''
            export ANDROID_HOME="${android_emulator_sdk.androidsdk}/libexec/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-''${XDG_DATA_HOME:-$HOME/.local/share}/x-tasks/avd}"
            mkdir -p "$ANDROID_AVD_HOME"

            if [ ! -d "$ANDROID_AVD_HOME/x-tasks.avd" ]; then
              echo no | avdmanager create avd --name x-tasks \
                --package "system-images;android-36;google_apis;x86_64" --device pixel_7 \
                --path "$ANDROID_AVD_HOME/x-tasks.avd"
              printf 'hw.keyboard = yes\nhw.gpu.enabled = yes\n' >> "$ANDROID_AVD_HOME/x-tasks.avd/config.ini"
            fi

            emulator -avd x-tasks -port 5554 -no-boot-anim "$@" &
            adb -s emulator-5554 wait-for-device
            until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do
              sleep 2
            done
            echo "x-tasks emulator is ready as emulator-5554"
            wait
          '';
        };

        # Builds the debug app and installs and opens it on the emulator, never on a connected phone.
        android_emulator_install = pkgs.writeShellApplication {
          name = "x-tasks-emulator-install";
          runtimeInputs = [ android_emulator_sdk.androidsdk ];
          text = ''
            npm run build:android
            (cd android && ./gradlew assembleDebug)
            adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
            adb -s emulator-5554 shell am start -n com.xtechlaboratories.xtasks/.MainActivity
          '';
        };

        # A shell with Node, a JDK and the given Android SDK, plus any extra tools.
        android_shell = sdk: tools: pkgs.mkShell {
          packages = [ nodejs android_pkgs.jdk21 sdk ] ++ tools;

          shellHook = ''
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export ANDROID_HOME="${sdk}/libexec/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export JAVA_HOME="${android_pkgs.jdk21.home}"

            # Gradle fetches its own aapt2, which cannot run on NixOS, so it is pointed at the SDK's.
            export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/${android_build_tools}/aapt2"

            echo "x-tasks android shell · node $(node -v) · build-tools ${android_build_tools}"
          '';
        };

        # What the desktop app and the web server share: the source, its npm packages and the Node they build with.
        npm_package = attributes: pkgs.buildNpmPackage ({
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = self;

          npmDepsHash = "sha256-/rEeA9Q0p0QA5PRi7ChVKRi3RC7hsRfcSZAlB5iAB/I=";
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
            cp -r out resources package.json node_modules $out/lib/x-tasks/
            install -Dm644 resources/icon.svg $out/share/icons/hicolor/scalable/apps/x-tasks.svg
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
              icon = "x-tasks";
              categories = [ "Office" "ProjectManagement" ];
              # Opens x-tasks://task/<id> links in the app.
              mimeTypes = [ "x-scheme-handler/x-tasks" ];
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

        # For building the Android app: `nix develop .#android`, then `npm run build:android` and `cd android && ./gradlew assembleDebug`.
        devShells.android = android_shell android_sdk.androidsdk [ ];

        # The Android shell plus an emulator: `x-tasks-emulator` starts it, `x-tasks-emulator-install` builds and runs the app on it.
        devShells.android-emulator = android_shell android_emulator_sdk.androidsdk [ android_emulator android_emulator_install ];
      }) // {
      nixosModules.default = import ./nix/server-module.nix self;
    };
}
