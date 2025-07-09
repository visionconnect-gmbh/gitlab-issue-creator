async function localizeHtmlPage() {
    //Localize by replacing __MSG_***__ meta tags
    var objects = document.querySelectorAll('[data-message=localize]');
    for (var j = 0; j < objects.length; j++) {
        var obj = objects[j];
        var valStrH = obj.innerHTML.toString();
        var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function (match, v1) {
            return v1 ? browser.i18n.getMessage(v1) : "";
        });
        if (valNewH !== valStrH) {
            obj.textContent = valNewH;
        }
    }
}

document.addEventListener('DOMContentLoaded', localizeHtmlPage);