package com.lordcookie.engram;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins VOR super.onCreate registrieren (Capacitor-Vorgabe).
        // Scanner v2: native Kamera (CameraX) + Texterkennung auf dem Gerät (ML Kit).
        registerPlugin(EngramCameraPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
