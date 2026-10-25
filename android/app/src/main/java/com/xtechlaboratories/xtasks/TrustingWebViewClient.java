package com.xtechlaboratories.xtasks;

import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.security.cert.X509Certificate;

// Accepts a server certificate the system does not trust only when the user's chosen authority signed it.
public class TrustingWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;

    public TrustingWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    // Any other problem, such as an expired certificate or a wrong host name, is still refused.
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        X509Certificate authority = TrustedCertificate.read(bridge.getContext());
        X509Certificate server = server_certificate(error.getCertificate());
        if (authority != null && server != null && error.getPrimaryError() == SslError.SSL_UNTRUSTED && is_signed_by(server, authority)) {
            handler.proceed();
        } else {
            handler.cancel();
        }
    }

    private static boolean is_signed_by(X509Certificate server, X509Certificate authority) {
        try {
            server.checkValidity();
            server.verify(authority.getPublicKey());
            return server.getIssuerX500Principal().equals(authority.getSubjectX500Principal());
        } catch (Exception error) {
            return false;
        }
    }

    // SslCertificate only hands out its X.509 form from Android 10, but its saved state carries the encoded certificate on every version.
    private static X509Certificate server_certificate(SslCertificate certificate) {
        if (certificate == null) return null;
        Bundle state = SslCertificate.saveState(certificate);
        byte[] encoded = state.getByteArray("x509-certificate");
        if (encoded == null) return null;
        try {
            return (X509Certificate) java.security.cert.CertificateFactory.getInstance("X.509").generateCertificate(new java.io.ByteArrayInputStream(encoded));
        } catch (Exception error) {
            return null;
        }
    }
}
