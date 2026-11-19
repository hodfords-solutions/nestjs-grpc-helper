module example.com/behavior-consumer-go

go 1.23

require example.com/behavior-sdk-go v0.0.0

// tests/sdk-behavior.spec.ts copies this module next to the generated SDK before running it.
replace example.com/behavior-sdk-go => ../sdk-go
