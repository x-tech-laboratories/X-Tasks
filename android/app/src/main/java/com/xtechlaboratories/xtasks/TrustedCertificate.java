package com.xtechlaboratories.xtasks;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

// The certificate authority the user chose to trust for their sync server, kept in the app's private preferences.
final class TrustedCertificate {

    private static final String PREFERENCES = "x-tasks-tls";
    private static final String PEM_KEY = "trusted_ca_pem";

    private TrustedCertificate() {}

    // Reads a PEM certificate, throwing when the text is not one.
    static X509Certificate parse(String pem) throws CertificateException {
        CertificateFactory factory = CertificateFactory.getInstance("X.509");
        return (X509Certificate) factory.generateCertificate(new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)));
    }

    static String read_pem(Context context) {
        return preferences(context).getString(PEM_KEY, "");
    }

    // An empty text forgets the certificate, so only publicly trusted servers are reached again.
    static void write_pem(Context context, String pem) {
        preferences(context).edit().putString(PEM_KEY, pem).apply();
    }

    // The saved authority, or null when none is set or it no longer parses.
    static X509Certificate read(Context context) {
        String pem = read_pem(context);
        if (pem.isEmpty()) return null;
        try {
            return parse(pem);
        } catch (CertificateException error) {
            return null;
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
