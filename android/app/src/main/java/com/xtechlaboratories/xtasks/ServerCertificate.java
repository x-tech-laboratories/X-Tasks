package com.xtechlaboratories.xtasks;

import android.content.Context;
import android.util.Base64;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

// Reads the certificates a sync server sends, so the user can be offered the authority that signed them.
final class ServerCertificate {

    private static final int TIMEOUT_MS = 10 * 1000;

    private ServerCertificate() {}

    // Connects without checking the certificates, only to read them; nothing is sent over the connection.
    static X509Certificate[] read_chain(String host, int port) throws Exception {
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[] { new AcceptingTrustManager() }, null);
        Socket plain = new Socket();
        plain.connect(new InetSocketAddress(host, port), TIMEOUT_MS);
        plain.setSoTimeout(TIMEOUT_MS);
        try (SSLSocket socket = (SSLSocket) context.getSocketFactory().createSocket(plain, host, port, true)) {
            socket.startHandshake();
            Certificate[] certificates = socket.getSession().getPeerCertificates();
            X509Certificate[] chain = new X509Certificate[certificates.length];
            for (int index = 0; index < certificates.length; index++) chain[index] = (X509Certificate) certificates[index];
            return chain;
        }
    }

    // Whether the phone's own authorities, or the one the user already chose, accept the server's certificate.
    static boolean is_trusted(Context context, X509Certificate[] chain) {
        X509Certificate chosen = TrustedCertificate.read(context);
        if (chosen != null && TrustingWebViewClient.is_signed_by(chain[0], chosen)) return true;
        try {
            TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            factory.init((KeyStore) null);
            for (TrustManager manager : factory.getTrustManagers()) {
                if (manager instanceof X509TrustManager) {
                    ((X509TrustManager) manager).checkServerTrusted(chain, "GENERIC");
                    return true;
                }
            }
        } catch (Exception error) {
            return false;
        }
        return false;
    }

    // The WebView checks only that the chosen authority signed the server's own certificate, so that signer is the one offered.
    static X509Certificate signer_of(X509Certificate[] chain) {
        X509Certificate server = chain[0];
        for (int index = 1; index < chain.length; index++) {
            if (TrustingWebViewClient.is_signed_by(server, chain[index])) return chain[index];
        }
        return TrustingWebViewClient.is_signed_by(server, server) ? server : null;
    }

    static String pem(X509Certificate certificate) throws Exception {
        return "-----BEGIN CERTIFICATE-----\n" + Base64.encodeToString(certificate.getEncoded(), Base64.DEFAULT) + "-----END CERTIFICATE-----";
    }

    // SHA-256 as colon-separated hex, as the desktop app and openssl show it.
    static String fingerprint(X509Certificate certificate) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
        StringBuilder text = new StringBuilder();
        for (byte value : digest) {
            if (text.length() > 0) text.append(':');
            text.append(String.format("%02X", value));
        }
        return text.toString();
    }

    private static final class AcceptingTrustManager implements X509TrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String auth_type) {}

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String auth_type) {}

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }
}
