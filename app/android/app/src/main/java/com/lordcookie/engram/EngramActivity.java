package com.lordcookie.engram;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Die eigentliche App-Activity. Sie hieß früher MainActivity — der Name lebt als
 * Launcher-Alias im Manifest weiter (Standard-Icon), damit bestehende Icons auf dem
 * Startbildschirm nach dem Update erhalten bleiben. Weitere Aliase = App-Icon je
 * Farbthema (EngramIconPlugin).
 */
public class EngramActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins VOR super.onCreate registrieren (Capacitor-Vorgabe).
        // Scanner v2: native Kamera (CameraX) + Texterkennung auf dem Gerät (ML Kit).
        registerPlugin(EngramCameraPlugin.class);
        // App-Icon passend zum Farbthema (Launcher-Aliase).
        registerPlugin(EngramIconPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
