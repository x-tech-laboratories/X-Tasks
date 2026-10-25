package com.xtechlaboratories.xtasks;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

// Lets the page read and set the certificate authority trusted for the sync server.
@CapacitorPlugin(name = "TrustedCertificate")
public class TrustedCertificatePlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        X509Certificate certificate = TrustedCertificate.read(getContext());
        JSObject result = new JSObject();
        result.put("pem", TrustedCertificate.read_pem(getContext()));
        result.put("subject", certificate == null ? "" : certificate.getSubjectX500Principal().getName());
        call.resolve(result);
    }

    // Saves the certificate after checking it parses, and answers with the name it was issued to.
    @PluginMethod
    public void set(PluginCall call) {
        String pem = call.getString("pem", "").trim();
        if (pem.isEmpty()) {
            TrustedCertificate.write_pem(getContext(), "");
            call.resolve(new JSObject().put("subject", ""));
            return;
        }
        try {
            X509Certificate certificate = TrustedCertificate.parse(pem);
            TrustedCertificate.write_pem(getContext(), pem);
            call.resolve(new JSObject().put("subject", certificate.getSubjectX500Principal().getName()));
        } catch (CertificateException error) {
            call.reject("That is not a PEM certificate.");
        }
    }
}
