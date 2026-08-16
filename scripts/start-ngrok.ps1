$log = "C:\Users\Dark\Desktop\RPG-Story-Life-Text\logs\ngrok.log"
while ($true) {
  ngrok start --log=stdout rpg *>> $log
  Start-Sleep -Seconds 10
}