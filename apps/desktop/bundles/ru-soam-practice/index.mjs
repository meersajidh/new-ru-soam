// ru-soam-practice bundle entry point.
//
// This module never executes. activationEvents: ["lazy"] + capabilities: []
// means the Bundle Host never activates this entry. It exists solely so
// bundle discovery (which requires the entry file to exist at the path
// declared in manifest.json) accepts the bundle.
//
// Views (practice.html) still register at boot regardless of activation state.
