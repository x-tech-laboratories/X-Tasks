package com.xtechlaboratories.xtasks;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        keep_backup_folder();
        super.onCreate(savedInstanceState);
    }

    // Backups moved to X-Libs' backup folder plugin, which keeps its folder under its own name; the folder picked before
    // is handed over once, and the app's lasting permission on it carries over with it.
    private void keep_backup_folder() {
        SharedPreferences before = getSharedPreferences("backup_folder", Context.MODE_PRIVATE);
        SharedPreferences now = getSharedPreferences("x_libs_backup_folder", Context.MODE_PRIVATE);
        String folder_uri = before.getString("folder_uri", null);
        if (folder_uri == null || now.contains("folder_uri")) return;
        now.edit().putString("folder_uri", folder_uri).apply();
        before.edit().remove("folder_uri").apply();
    }
}
