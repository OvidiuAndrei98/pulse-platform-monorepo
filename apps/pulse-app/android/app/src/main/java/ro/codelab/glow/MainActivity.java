package ro.codelab.glow;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TicketBrightnessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
