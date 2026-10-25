package com.xtechlaboratories.xtasks;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Plugins kept in this app are registered before the bridge starts.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupFolderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
