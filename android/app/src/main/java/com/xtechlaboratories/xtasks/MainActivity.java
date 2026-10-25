package com.xtechlaboratories.xtasks;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Plugins kept in this app are registered before the bridge starts, and the WebView then checks certificates against the trusted authority.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupFolderPlugin.class);
        registerPlugin(TrustedCertificatePlugin.class);
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new TrustingWebViewClient(bridge));
    }
}
