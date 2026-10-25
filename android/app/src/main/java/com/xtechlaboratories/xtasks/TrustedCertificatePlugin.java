package com.xtechlaboratories.xtasks;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URL;
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

    // Offers the authority behind a server certificate the phone would refuse; every field is empty when there is nothing to offer.
    @PluginMethod
    public void inspect(PluginCall call) {
        String address = call.getString("url", "");
        new Thread(() -> {
            JSObject result = new JSObject().put("pem", "").put("subject", "").put("fingerprint", "");
            try {
                URL url = new URL(address);
                if (url.getProtocol().equals("https")) {
                    X509Certificate[] chain = ServerCertificate.read_chain(url.getHost(), url.getPort() == -1 ? 443 : url.getPort());
                    X509Certificate signer = ServerCertificate.is_trusted(getContext(), chain) ? null : ServerCertificate.signer_of(chain);
                    if (signer != null) {
                        result.put("pem", ServerCertificate.pem(signer));
                        result.put("subject", signer.getSubjectX500Principal().getName());
                        result.put("fingerprint", ServerCertificate.fingerprint(signer));
                    }
                }
            } catch (Exception error) {
                // An unreachable server is reported by sync itself, so there is nothing to offer here.
            }
            call.resolve(result);
        }).start();
    }
}
