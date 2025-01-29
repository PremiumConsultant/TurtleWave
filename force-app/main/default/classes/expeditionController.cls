public with sharing class expeditionController {
    @AuraEnabled(cacheable=true)
    public static List<Expedition__c> getExpeditionData() {
        Id userId = UserInfo.getUserId();
        return [SELECT Id, Name, Start_Date__c, End_Date__c, Notes__c, Status__c
                FROM Expedition__c 
                WHERE Id IN (
                    SELECT Expedition__c 
                    FROM Team_Member_Role__c 
                    WHERE Team_Member__r.Contact_User__r.id = :userId 
                    AND Expedition__r.Status__c != 'Completed'
                )
                ORDER BY CreatedDate DESC
        ];
    }
    
    @AuraEnabled
    public static Map<Id, List<Action_Item__c>> getActionItems(List<Id> expeditionIds) {
        Map<Id, List<Action_Item__c>> actionsByExpedition = new Map<Id, List<Action_Item__c>>();
        
        List<Action_Item__c> allActions = [SELECT Id, Title__c, Description__c, Findings__c, Completed__c, Expedition__c
                                            FROM Action_Item__c
                                            WHERE Expedition__c IN :expeditionIds 
                                            AND Completed__c = false
        ];
        for(Action_Item__c action : allActions) {
            if(!actionsByExpedition.containsKey(action.Expedition__c)) {
                actionsByExpedition.put(action.Expedition__c, new List<Action_Item__c>());
            }
            actionsByExpedition.get(action.Expedition__c).add(action);
        }
        return actionsByExpedition;
    }

    @AuraEnabled
    public static void updateActionFindings(Id actionId, String findings) {
        Action_Item__c action = [SELECT Id, Findings__c FROM Action_Item__c WHERE Id = :actionId];
        if (action.Findings__c == null) {
            action.Findings__c = '• ' + findings;
        } else {
            action.Findings__c += '\n• ' + findings;
        }
        update action;
    }

    @AuraEnabled
    public static void updateExpeditionNotes(Id expeditionId, String notes) {
        update new Expedition__c(Id = expeditionId, Notes__c = notes);
    }

    @AuraEnabled
    public static void completeExpedition(Id expeditionId) {
        update new Expedition__c(Id = expeditionId, Status__c = 'Completed', End_Date__c = System.today());
    }

    @AuraEnabled
    public static void updateActionCompletion(Id actionId, Boolean isCompleted) {
        Action_Item__c action = [SELECT Id, Completed__c, Completed_Date__c FROM Action_Item__c WHERE Id = :actionId LIMIT 1];
        if (isCompleted) {
            action.Completed__c = true;
            action.Completed_Date__c = System.today();
            update action;
        }
    }

    @AuraEnabled
    public static void uploadPhotoToExpedition(Id expeditionId, String fileName, String fileContent) {
        if (expeditionId == null || fileName == null || fileContent == null) {
            throw new AuraHandledException('Invalid parameters.');
        }
        try {
            Blob fileBody = EncodingUtil.base64Decode(fileContent);
            ContentVersion contentVersion = new ContentVersion();
            contentVersion.Title = fileName;
            contentVersion.PathOnClient = fileName;
            contentVersion.VersionData = fileBody;
            insert contentVersion;

            ContentVersion insertedVersion = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :contentVersion.Id LIMIT 1];
            
            ContentDocumentLink contentDocumentLink = new ContentDocumentLink();
            contentDocumentLink.ContentDocumentId = insertedVersion.ContentDocumentId;
            contentDocumentLink.LinkedEntityId = expeditionId;
            contentDocumentLink.ShareType = 'I';
            insert contentDocumentLink;
        } catch (Exception e) {
            throw new AuraHandledException('Error uploading photo: ' + e.getMessage());
        }
    }
}